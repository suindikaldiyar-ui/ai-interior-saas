'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type * as THREE from 'three';
import { useSlide } from './useSlide';
import { useTouchTarget } from './useTouchTarget';
import { useShiftedBox, type CabinetParts } from './parts';
import { realSizeShiftOf } from './realSizeMap';
import { leafOfBox, useReliefGeometry, useShiftedRelief } from './reliefGeometry';
import { DRAWER_TRAVEL_M, type PartBox } from '@/lib/millwork/cabinetBoxes';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HandleMesh } from './handleMesh';
import { boxGeometryOf } from './profileGeometry';
import { TwinModel, twinKeyOf } from './twinAsset';
import { drawerSettledOpen, drawerTravelOf, onDrawerSettled, onDrawerTravel, setDrawerSettledOpen, setDrawerTravel } from './drawerTravel';

/**
 * ЯЩИК ОТСЕКА (R02A), КОТОРЫЙ ВЫЕЗЖАЕТ.
 *
 * Рисует РОВНО те коробки, что лежат в общей пачке, — фасад и габарит
 * рабочей зоны из `bayDrawerBoxes` либо детали короба по комплекту и
 * ходовую половину направляющей (HARDWARE-01), — только своим мешем и со
 * сдвигом: второй геометрии ящика в сцене нет. Ход — наглядный: 300 мм
 * (`DRAWER_TRAVEL_M`), а не ход направляющей из паспорта.
 *
 * Каждый ящик — свой ключ: открытый один не трогает остальные.
 */

type Props = {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  /** Коробки этого ящика в координатах модуля (метры): те же, что в пачке. */
  boxes: PartBox[];
  parts: CabinetParts;
  /** Материал фасада ЭТОГО модуля: открытый фасад не меняет цвет. */
  frontMaterial?: THREE.MeshStandardMaterial;
  /** Ящик поехал или встал: задвинутый рисуется вместе со всем рядом. */
  onActive?: (id: string, active: boolean) => void;
  /**
   * ХОД, метры (HARDWARE-01). Пусто — вперёд на `DRAWER_TRAVEL_M`, как у
   * ящика. Пантограф едет вниз и вперёд, полотно купе — вбок: вектор
   * считает движок (`sceneSlides`), здесь он только применяется.
   */
  vectorM?: [number, number, number];
  /**
   * ВНУТРЕННИЙ ЯЩИК ЗА ФАСАДОМ (2026-11-02): ИД наружного ящика. Ход — не дальше наружного и только когда
   * наружный открыт до конца (`drawerTravel`); нажатие ловит, только когда наружный открыт.
   */
  follows?: string;
  /**
   * НАРУЖНЫЙ С ВНУТРЕННИМ (2026-11-02): зона касания — фасад (тонкой пластиной во всю высоту) и свой короб,
   * без полосы внутреннего ящика: там нажатие принадлежит внутреннему.
   */
  hasInner?: boolean;
};

/** Толщина зоны касания фасада наружного ящика с внутренним, метры: за фасадом, у его тыла. */
const FRONT_TOUCH_M = 0.03;

export default function InteractiveBayDrawer({ id, open, onToggle, boxes, parts, frontMaterial, onActive, vectorM, follows, hasInner }: Props) {
  const travel: [number, number, number] = vectorM ?? [0, 0, DRAWER_TRAVEL_M];
  const economy = useInteriorStore((state) => state.economyMode);
  const group = useRef<THREE.Group>(null);
  const touch = useRef<THREE.Mesh>(null);
  const [active, setActive] = useState(open);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open) setActive(true);
  }, [open]);

  useEffect(() => {
    onActive?.(id, active);
  }, [id, active, onActive]);

  /* Средняя секция направляющей едет на свою долю хода (HW-04): обратный сдвиг внутри группы ящика. */
  const middle = useRef<THREE.Group>(null);
  const share = boxes.find((box) => box.slideShare !== undefined)?.slideShare ?? 1;
  /*
   * НАРУЖНЫЙ И ВНУТРЕННИЙ (2026-11-02): каждый ящик сообщает свой ход (метры по глубине) и «открыт до конца»;
   * внутренний (`follows`) начинает ход, когда наружный открыт до конца, и стоит не дальше него — на ходу
   * закрытия тоже, синхронно с наружным: передняя панель внутреннего за тылом наружного фасада ни на кадр.
   */
  const outerOpen = useSyncExternalStore(
    onDrawerSettled,
    () => (follows ? drawerSettledOpen(follows) : true),
    () => !follows,
  );
  const own = useRef(open && outerOpen ? 1 : 0);
  const place = () => {
    const limit = follows && travel[2] > 0 ? drawerTravelOf(follows) / travel[2] : 1;
    const value = Math.min(own.current, limit);
    const el = group.current;
    if (el) el.position.set(travel[0] * value, travel[1] * value, travel[2] * value);
    const mid = middle.current;
    if (mid) mid.position.set(-travel[0] * value * (1 - share), -travel[1] * value * (1 - share), -travel[2] * value * (1 - share));
    setDrawerTravel(id, travel[2] * value);
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
    target: open && outerOpen ? 1 : 0,
    /* Звук (фаза 4): внутренний ящик, корзина нижней сушки, ящик системы (царги — сечения), остальное — ящик. */
    sound: follows ? 'inner_drawer' : boxes.some((b) => b.dryer) ? 'dryer' : boxes.some((b) => b.section) ? 'tandembox' : vectorM && vectorM[1] !== 0 ? 'pantograph' : 'drawer',
    initial: open && outerOpen ? 1 : 0,
    apply: (value) => {
      own.current = value;
      if (value < 1 - 1e-6) setDrawerSettledOpen(id, false);
      place();
    },
    onSettle: () => {
      setDrawerSettledOpen(id, openRef.current && own.current >= 1 - 1e-6);
      if (!openRef.current) setActive(false);
    },
  });
  const reachable = !follows || outerOpen;

  /*
   * Зона касания — габарит коробок ящика: фасад и рабочая зона за ним. У наружного с внутренним — без
   * фасада (своя пластина ниже): иначе выдвинутый наружный накрывает внутренний, и нажатие на внутренний
   * задвигало наружный.
   */
  const frontBoxOf = boxes.find((box) => box.material === 'front');
  const hit = useMemo(() => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const box of boxes) {
      if (hasInner && box.material === 'front') continue;
      x0 = Math.min(x0, box.position[0] - box.scale[0] / 2);
      x1 = Math.max(x1, box.position[0] + box.scale[0] / 2);
      y0 = Math.min(y0, box.position[1] - box.scale[1] / 2);
      y1 = Math.max(y1, box.position[1] + box.scale[1] / 2);
      z0 = Math.min(z0, box.position[2] - box.scale[2] / 2);
      z1 = Math.max(z1, box.position[2] + box.scale[2] / 2);
    }
    return {
      center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] as [number, number, number],
      size: [x1 - x0, y1 - y0, z1 - z0] as [number, number, number],
    };
  }, [boxes, hasInner]);

  useTouchTarget(touch, { width: hit.size[0], height: hit.size[1], depth: hit.size[2] });
  const onClick = reachable
    ? (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onToggle(id);
      }
    : undefined;

  /* Фронт ящика — тот же кусок дерева, что у него закрытого в пачке (ключ — идентификатор ящика). */
  const frontBox = useShiftedBox(parts.box, id);
  /* Рельеф МДФ фронта (P3D-MDF) — с коробки фронта той же пачки (`bayDrawerBoxes`). */
  const front = boxes.find((box) => box.material === 'front');
  const reliefGeometry = useShiftedRelief(
    useReliefGeometry(front?.relief, leafOfBox(front?.scale ?? [0, 0, 0]), front?.reliefOrient),
    realSizeShiftOf(id),
  );
  const materialOf = (box: PartBox) =>
    box.material === 'front'
      ? (frontMaterial ?? parts.front)
      : box.material === 'inner'
        ? parts.inner
        : box.material === 'metal'
          ? parts.metal
          : parts.carcass;

  return (
    <group ref={group}>
      {/* Фасад наружного с внутренним — своя тонкая зона касания во всю высоту, у тыла фасада. */}
      {hasInner && frontBoxOf ? (
        <mesh
          name={`part:${id}`}
          position={[frontBoxOf.position[0], frontBoxOf.position[1], frontBoxOf.position[2] - frontBoxOf.scale[2] / 2 - FRONT_TOUCH_M / 2]}
          geometry={parts.box}
          material={parts.hit}
          visible={false}
          scale={[frontBoxOf.scale[0], frontBoxOf.scale[1], FRONT_TOUCH_M]}
          onClick={onClick}
        />
      ) : null}
      <mesh
        ref={touch}
        name={`part:${id}`}
        position={hit.center}
        geometry={parts.box}
        material={parts.hit}
        visible={false}
        scale={hit.size}
        onClick={onClick}
        onPointerOver={
          reachable
            ? (event) => {
                event.stopPropagation();
                document.body.style.cursor = 'pointer';
              }
            : undefined
        }
        onPointerOut={
          reachable
            ? () => {
                document.body.style.cursor = '';
              }
            : undefined
        }
      />
      {/* Средние секции направляющих — своей группой на долю хода. */}
      <group ref={middle}>
        {active &&
          boxes.map((box, i) =>
            box.slideShare !== undefined ? (
              box.twin ? (
                <TwinModel key={`mid-${i}`} twin={box.twin.model} role={box.twin.role} anchorM={box.twin.anchorM} mirror={box.twin.mirror} name={`twin:${box.twin.role}`} twinKey={twinKeyOf(box)} />
              ) : (
                <mesh key={`mid-${i}`} name="mech:runner-middle" geometry={boxGeometryOf(box, parts.box)} material={parts.metal} position={box.position} scale={box.scale} userData={{ section: box.section }} />
              )
            ) : null,
          )}
      </group>
      {active &&
        boxes.map((box, i) =>
          box.slideShare !== undefined ? null : /* Царга и ходовая с моделью реестра (§ 5) — модель, а не сечение. */
          box.twin ? (
            <TwinModel key={`twin-${i}`} twin={box.twin.model} role={box.twin.role} anchorM={box.twin.anchorM} mirror={box.twin.mirror} name={`twin:${box.twin.role}`} twinKey={twinKeyOf(box)} />
          ) : /* Ручка едет своей моделью, той же, что у задвинутого в пачке (HANDLE-REAL). */
          box.handle ? (
            <HandleMesh key={`handle-${i}`} draw={box.handle} position={box.position} fine={!economy} part={box.part ?? id} />
          ) : (
            <mesh
              key={`${box.partId ?? box.panel ?? 'box'}-${i}`}
              name={box.node ? `mech:${box.node}` : box.panel ? `panel:${box.panel}` : undefined}
              geometry={box.material === 'front' ? (reliefGeometry ?? frontBox) : boxGeometryOf(box, parts.box)}
              userData={{ section: box.section }}
              material={materialOf(box)}
              position={box.position}
              scale={box.material === 'front' && reliefGeometry ? [1, 1, 1] : box.scale}
              castShadow={box.material === 'front'}
            />
          ),
        )}
    </group>
  );
}
