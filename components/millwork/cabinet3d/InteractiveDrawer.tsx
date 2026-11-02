'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import { drawerSettledOpen, drawerTravelOf, onDrawerSettled, onDrawerTravel, setDrawerSettledOpen, setDrawerTravel } from './drawerTravel';

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
  /** Детали, которые едут с ящиком (вставки A6: органайзер, разделители, релинги) — коробки пачки. */
  riders?: PartBox[];
  /** Ход, метры (HW-04): модель направляющей на месте модуля (`runnerModelOf`). Пусто — условные 300 мм. */
  travelM?: number;
  /**
   * ВНУТРЕННИЙ ЯЩИК ЗА ФАСАДОМ (2026-11-02): ИД наружного ящика, за фасадом которого он стоит. Ход —
   * не дальше наружного и только когда наружный открыт до конца (`drawerTravel`).
   */
  follows?: string;
  /**
   * НАРУЖНЫЙ С ВНУТРЕННИМ (2026-11-02): сколько сверху фасада занимает внутренний ящик, метры. Короб-зона
   * касания наружного — без этой полосы (там нажатие принадлежит внутреннему); фасад ловит нажатие тонкой
   * пластиной во всю высоту.
   */
  innerTopM?: number;
};

/** Толщина зоны касания фасада наружного ящика с внутренним, метры: за фасадом, у его тыла. */
const FRONT_TOUCH_M = 0.03;

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
  riders,
  follows,
  innerTopM,
}: Props) {
  const economy = useInteriorStore((state) => state.economyMode);
  const visibleHit = showFront || showBox || Boolean(handle);
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

  /*
   * НАРУЖНЫЙ И ВНУТРЕННИЙ (2026-11-02). Каждый ящик сообщает свой ход и «открыт до конца»; внутренний
   * (`follows`) начинает ход, когда наружный открыт до конца, и стоит не дальше него — на ходу закрытия
   * тоже: его передняя панель за тылом наружного фасада, пересечения нет ни на кадр.
   */
  const outerOpen = useSyncExternalStore(
    onDrawerSettled,
    () => (follows ? drawerSettledOpen(follows) : true),
    () => !follows,
  );
  /* Внутренний ловит нажатие, только когда наружный открыт: закрытый он за фасадом, дотянуться до него нельзя. */
  const hit = visibleHit && (!follows || outerOpen);
  const own = useRef(open ? travelM : 0);
  const place = () => {
    const el = group.current;
    if (!el) return;
    el.position.z = follows ? Math.min(own.current, drawerTravelOf(follows)) : own.current;
    setDrawerTravel(id, el.position.z);
  };
  useEffect(() => (follows ? onDrawerTravel(follows, () => place()) : undefined));
  useEffect(
    () => () => {
      setDrawerSettledOpen(id, false);
      setDrawerTravel(id, 0);
    },
    [id],
  );

  useSlide({
    target: open && outerOpen ? travelM : 0,
    sound: follows ? 'inner_drawer' : 'drawer',
    initial: open && outerOpen ? travelM : 0,
    apply: (value) => {
      own.current = value;
      if (value < travelM - 1e-6) setDrawerSettledOpen(id, false);
      place();
    },
    onSettle: () => {
      setDrawerSettledOpen(id, openRef.current && own.current >= travelM - 1e-6);
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
  const bodyH = innerTopM ? Math.max(0.02, height - innerTopM) : height;
  useTouchTarget(touch, { width, height: bodyH, depth });
  const onClick = hit
    ? (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onToggle(id);
      }
    : undefined;

  return (
    <group ref={group} position={[x + width / 2, y + height / 2, 0]}>
      {/* Фасад наружного с внутренним ящиком — своя тонкая зона касания во всю высоту (короб-зона ниже внутреннего). */}
      {innerTopM ? (
        <mesh
          name={`part:${id}`}
          position={[0, 0, -FRONT_TOUCH_M / 2]}
          geometry={parts.box}
          material={parts.hit}
          visible={false}
          scale={[width, height, FRONT_TOUCH_M]}
          onClick={onClick}
        />
      ) : null}
      {/* Невидимая зона касания. */}
      <mesh
        ref={touch}
        name={`part:${id}`}
        position={[0, innerTopM ? -(height - bodyH) / 2 : 0, -depth / 2]}
        geometry={parts.box}
        material={parts.hit}
        /*
         * Зона касания не рисуется вовсе. Прозрачный меш всё равно уходит
         * в рендер: тринадцать модулей давали больше тридцати вызовов
         * отрисовки на то, чего не видно. Луч указателя невидимые объекты
         * по-прежнему находит — проверено кликом по мебели.
         */
        visible={false}
        scale={[width, bodyH, depth]}
        onClick={onClick}
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

          {/* Вставки (A6) — те же коробки пачки: место в модуле минус начало группы ящика. */}
          {riders?.map((box, i) => (
            <mesh
              key={`rider-${i}`}
              geometry={parts.box}
              material={box.material === 'metal' ? parts.metal : parts.carcass}
              position={[box.position[0] - (x + width / 2), box.position[1] - (y + height / 2), box.position[2]]}
              scale={box.scale}
              name="mech:insert"
            />
          ))}

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
