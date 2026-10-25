'use client';

import * as THREE from 'three';

import { useMemo } from 'react';
import { bayDrawerBoxes, boxShown, sceneLeaves, type PartBox } from '@/lib/millwork/cabinetBoxes';
import { DRAWER_SIDE_PANEL_NAME } from '@/lib/millwork/drawerBox';
import { ALL_LAYERS, type SceneLayers } from '@/lib/millwork/sceneLayers';
import { ROD_VISUAL_DIAMETER_MM } from '@/lib/millwork/bays';
import type { HardwareItem, ProductionSettings } from '@/types/catalog';
import InteractiveBayDrawer from './InteractiveBayDrawer';
import InteractiveDoor from './InteractiveDoor';
import InteractiveBifold from './InteractiveBifold';
import InteractiveCornerPair from './InteractiveCornerPair';
import InteractiveDrawer from './InteractiveDrawer';
import type { CabinetParts } from './parts';
import type { GlassMaterials } from './glassLook';
import { glassOf } from '@/lib/millwork/glass';
import type { FrontRelief, Module } from '@/types/millwork';
import { gripOrient } from '@/lib/millwork/facadeRelief';
import { isUpperRow } from '@/lib/millwork/modules';

/**
 * Один модуль в 3D: корпус и его настоящее наполнение.
 *
 * Полки берутся из `fill.shelves` КАК ЕСТЬ. Пересчитывать их здесь нельзя:
 * они уже сели на систему 32 в `fill.ts`, и второй расчёт развёл бы 3D
 * с чертежом и детализировкой.
 */

const MM = 1000;

type Props = {
  unit: Module;
  /** Зазор вокруг фасада и толщина фасада — из настроек цеха. */
  gapM: number;
  frontThicknessM: number;
  integratedHandles: boolean;
  /** Левый край модуля от левого края ряда, метры. */
  x: number;
  /** Низ корпуса от пола, метры. */
  y: number;
  heightM: number;
  depthM: number;
  /**
   * Смещение фасада от плоскости ряда: то же число, что у неподвижных
   * коробок (`ModulePlacement.zM`). Своего у подвижных быть не может —
   * открытая дверца уехала бы от собственного корпуса.
   */
  zM?: number;
  thicknessM: number;
  parts: CabinetParts;
  openParts: string[];
  onToggle: (id: string) => void;
  cutaway: boolean;
  /** Подсветка витрины горит. Перед захватом кадра гаснет. */
  displayLit?: boolean;
  /** Деталь поехала: ряд убирает её из общей отрисовки. */
  onActive?: (id: string, active: boolean) => void;
  /** Материал фасада этого модуля: у подвижных створок он тот же. */
  frontMaterial?: THREE.MeshStandardMaterial;
  /**
   * ФАСАД ОТДЕЛЬНОЙ СТВОРКИ (P3D-MDF): материал и рельеф по детали модуля
   * (`door:0`, `drawer:1`). Его считает ряд той же `leafFrontWithMilling`,
   * что красит закрытые фасады в пачке: открытая створка не меняет ни цвет,
   * ни рисунок. Нет — у всех створок фасад модуля, как раньше.
   */
  leafLook?: (leaf: string) => { material?: THREE.MeshStandardMaterial; relief?: FrontRelief };
  /**
   * ДОСТУПНАЯ ШИРИНА ФАСАДА У СЛЕПОГО УГЛА, метры (слой 55): створка одна
   * и только здесь; ноль — створки нет. Пусто — модуль не у слепого угла.
   * Число — `openFrontMm`, то же, что у неподвижной отрисовки и раскроя.
   */
  openWidthM?: number;
  /** С какой отметки модуля доступная часть, метры: у угла в начале ряда — справа (P0, `openFrontOf`). */
  openFromM?: number;
  /** Нога Г-модуля слева — модуль в начале ряда (P0, `lLegOf`). */
  legSide?: 'left' | 'right';
  /** Школа цеха ряда: по ней `bayLayout` считает ящики отсеков — те же числа, что в пачке (R02A). */
  production?: ProductionSettings;
  /**
   * Слои вида (P1). Подвижная деталь выключенного слоя не рисуется и не
   * ловит нажатие: открыть невидимую створку нельзя. Слой — той же
   * `boxLayer`, что у неподвижной пачки.
   */
  layers?: SceneLayers;
  /**
   * КОРОБКИ ПОДВИЖНОЙ ДЕТАЛИ В КООРДИНАТАХ РЯДА — те же, что лежат в пачке
   * (`runBoxes`, HARDWARE-01). По ним едет ящик с коробом по комплекту и
   * ящик отсека: открытый несёт ровно то, что нарисовано задвинутым.
   */
  partBoxes?: (partId: string) => PartBox[] | undefined;
  /** Фурнитура организации: ручка Г-модуля на ходу — та же позиция, что у закрытого (HANDLE-REAL). */
  hardware?: Map<string, HardwareItem>;
  /** Материалы стекла ряда (V3D-02): едущая дверь витрины — того же вида, что закрытая в пачке. */
  glass?: GlassMaterials;
};

/** Штанга: условное сечение — то же число, что у штанги зоны отсека (`ROD_VISUAL_DIAMETER_MM`). */
const ROD_DIAMETER_M = ROD_VISUAL_DIAMETER_MM / MM;

/*
 * Какая техника ВИДНА в кадре и потому стоит без створки, решает
 * `hasVisibleAppliance` внутри `sceneLeaves`: копия списка приборов здесь
 * была второй (слой 55).
 */

export default function CabinetModule3D({
  unit,
  gapM,
  frontThicknessM,
  integratedHandles,
  x,
  y,
  heightM,
  depthM,
  zM = 0,
  thicknessM,
  parts,
  openParts,
  onToggle,
  cutaway,
  displayLit = true,
  onActive,
  frontMaterial,
  leafLook,
  openWidthM,
  openFromM = 0,
  legSide,
  production,
  layers = ALL_LAYERS,
  partBoxes,
  hardware,
  glass,
}: Props) {
  /* Деталь модуля по идентификатору сцены: `<модуль>:door:0` → `door:0`. */
  const lookOf = (partId: string) => leafLook?.(partId.slice(unit.id.length + 1));
  const widthM = unit.widthMm / MM;
  const fill = unit.fill;

  // Внутренние размеры считаются той же формулой, что в детализировке:
  // разойдись они — клиент увидит одно, а цех получит другое.
  const innerW = Math.max(0.05, widthM - 2 * thicknessM);
  const innerDepth = depthM - thicknessM;

  const isOpen = (id: string) => openParts.includes(id);

  /* Коробки детали из пачки ряда — в координатах модуля, только включённых слоёв. */
  const localBoxesOf = (id: string): PartBox[] | undefined =>
    partBoxes?.(id)
      ?.filter((box) => boxShown(box, layers))
      .map((box) => ({
        ...box,
        position: [box.position[0] - x, box.position[1] - y, box.position[2] - zM] as [number, number, number],
      }));

  const isDisplay = unit.section === 'glass_display';
  /* Стекло этого модуля — вида, выбранного у него (`Module.glass`). */
  const glassMaterial = glass?.door[glassOf(unit)];

  /*
   * ЯЩИКИ ОТСЕКОВ (R02A): коробки — те же, что в общей пачке
   * (`bayDrawerBoxes`), сгруппированные по ящику. Задвинутый рисует пачка,
   * выехавший — свой меш с этими же коробками.
   */
  const bayDrawers = useMemo(() => {
    const byDrawer = new Map<string, PartBox[]>();
    for (const box of bayDrawerBoxes(
      unit,
      { x: 0, y: 0, heightM, depthM, zM: 0, thicknessM },
      { gapM, frontThicknessM, integratedHandles, cutaway },
      production,
    )) {
      if (!box.part) continue;
      /* Выехавший ящик несёт только детали включённых слоёв: короб без фронта в «Наполнении». */
      if (!boxShown(box, layers)) continue;
      const list = byDrawer.get(box.part);
      if (list) list.push(box);
      else byDrawer.set(box.part, [box]);
    }
    /*
     * Короб по комплекту (HARDWARE-01) знает только пачка ряда — у неё есть
     * каталог фурнитуры и правила цеха. Есть её коробки — едут они.
     */
    return Array.from(byDrawer.entries()).map(([id, own]) => {
      const fromRow = partBoxes?.(id)
        ?.filter((box) => boxShown(box, layers))
        .map((box) => ({
          ...box,
          position: [box.position[0] - x, box.position[1] - y, box.position[2] - zM] as [number, number, number],
        }));
      return [id, fromRow && fromRow.length > 0 ? fromRow : own] as [string, PartBox[]];
    });
  }, [unit, heightM, depthM, thicknessM, gapM, frontThicknessM, integratedHandles, cutaway, production, layers, partBoxes, x, y, zM]);

  return (
    <group position={[x, y, zM]}>
      {/*
        * Корпуса здесь нет НАМЕРЕННО: боковины, дно, крыша, задняя стенка,
        * полки и перегородка уходят числами в `carcassBoxes` и рисуются
        * одним `InstancedMesh` на весь ряд. Сотня неподвижных коробок —
        * это сотня вызовов отрисовки на мебель, которая не двигается.
        */}

      {/* Штанги: труба поперёк секции. Это фурнитура — слой «Фурнитура». */}
      {layers.hardware && fill?.rodsMm.map((mm) => (
        <mesh
          key={`rod-${mm}`}
          geometry={parts.cylinder}
          material={parts.metal}
          position={[widthM / 2, mm / MM, -depthM / 2]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[ROD_DIAMETER_M, innerW, ROD_DIAMETER_M]}
        />
      ))}

      {/*
        * Техники здесь тоже нет: тёмные блоки приборов и ниши колонны
        * считает `applianceBoxes` и рисует общая отрисовка ряда. Ниши
        * по-прежнему берутся из `columnNiches` — той же функции, что
        * рисует чертёж.
        */}

      {/*
        * ВИТРИНА: дверь в раме — рама и стекло коробками пачки ряда
        * (`displayDoorBoxes`), открывается как створка (V3D-02). Здесь —
        * только свечение ленты САПР-вида; в «Интерьере» ленту и её свет
        * рисует освещение комнаты. Подсветка гаснет перед захватом кадра —
        * светящаяся полоса в clay читается моделью как часть мебели.
        */}
      {isDisplay && !cutaway && layers.fronts && displayLit && (
        <mesh
          geometry={parts.box}
          material={parts.glow}
          position={[widthM / 2, heightM - thicknessM * 1.5, -depthM / 2]}
          scale={[widthM - 2 * thicknessM, 0.012, depthM - thicknessM]}
        />
      )}

      {/*
        * ЯЩИКИ И СТВОРКИ — СПИСКОМ `sceneLeaves` (слой 55).
        *
        * Какие створки рисовать, куда они открываются (те же данные, что
        * у диагонали на чертеже — `doorOpening`), одна ли она у слепого
        * угла и где стоят ящики — решает одна функция движка. Проверка
        * открывания у угла меряет её же: свои ветки здесь разошлись бы с
        * ней молча.
        *
        * Ящик едет сам, пока едет; двери в разрезе не рисуются вовсе.
        * Встроенная техника (холодильник, посудомойка, мойка) закрыта
        * фасадом наравне с обычным модулем: так это и выглядит в квартире.
        */}
      {sceneLeaves(unit, heightM, openWidthM, openFromM).map((leaf) => {
        /*
         * СЛОИ — ЭТО ЧТО ВИДНО, А НЕ ЧТО ОТКРЫВАЕТСЯ (STAGE A).
         *
         * Выключенный слой «Фасады» убирал подвижную деталь целиком: в
         * «Наполнении» короб ящика не выезжал, корзины карго стояли, петли в
         * виде «только фурнитура» оставались на месте открытой створки.
         * Теперь деталь ходит всегда, а в кадре — коробки включённых слоёв
         * (`localBoxesOf` → `boxShown`); нажать можно то, что видно.
         */
        const look = lookOf(leaf.id);
        if (leaf.kind === 'drawer') {
          /*
           * КОРОБ ПО КОМПЛЕКТУ (HARDWARE-01): выезжают детали раскроя и
           * ходовая половина направляющей — те же коробки, что в пачке.
           * Условный короб `InteractiveDrawer` здесь показал бы другую мебель.
           * Комплект ли это — по ВСЕМ коробкам детали: при выключенном слое
           * «Ящики» его коробок в кадре нет, но это всё тот же комплект.
           */
          const kitOwn = partBoxes?.(leaf.id)?.some((box) => box.node === 'runner' || box.panel === DRAWER_SIDE_PANEL_NAME);
          const kit = localBoxesOf(leaf.id) ?? [];
          if (kitOwn) {
            if (kit.length === 0) return null;
            return (
              <InteractiveBayDrawer
                key={leaf.id}
                id={leaf.id}
                open={isOpen(leaf.id)}
                onToggle={onToggle}
                boxes={kit}
                parts={parts}
                frontMaterial={look?.material ?? frontMaterial}
                onActive={onActive}
              />
            );
          }
          return (
            <InteractiveDrawer
              key={leaf.id}
              id={leaf.id}
              open={isOpen(leaf.id)}
              onToggle={onToggle}
              x={0}
              y={leaf.bottomM}
              width={widthM}
              height={leaf.heightM}
              depth={innerDepth}
              thickness={frontThicknessM}
              parts={parts}
              cutaway={cutaway}
              gap={gapM}
              handle={localBoxesOf(leaf.id)?.find((box) => box.node === 'handle')}
              showFront={layers.fronts}
              showBox={layers.drawers}
              onActive={onActive}
              frontMaterial={look?.material ?? frontMaterial}
              relief={look?.relief}
              reliefOrient={gripOrient(look?.relief, 'flap', isUpperRow(unit))}
            />
          );
        }
        if (cutaway) return null;
        if (leaf.kind === 'pullout') {
          /* Карго: фасад и корзины — коробки пачки ряда, едут вперёд вместе. */
          const moving = localBoxesOf(leaf.id);
          if (!moving || moving.length === 0) return null;
          return (
            <InteractiveBayDrawer
              key={leaf.id}
              id={leaf.id}
              open={isOpen(leaf.id)}
              onToggle={onToggle}
              boxes={moving}
              parts={parts}
              frontMaterial={look?.material ?? frontMaterial}
              onActive={onActive}
            />
          );
        }
        if (leaf.kind === 'lpair') {
          /* Пара дверец ходит одним ходом (`lPairStroke`): рисует её первая дверца списка, вторая — та же пара. */
          if (leaf.leg !== 0) return null;
          const showHandles = boxShown({ material: 'metal', node: 'handle', part: leaf.id }, layers);
          if (!layers.fronts && !showHandles) return null;
          return (
            <InteractiveCornerPair
              key={leaf.id}
              unit={unit}
              openA={isOpen(`${unit.id}:door:0`)}
              openB={isOpen(`${unit.id}:door:1`)}
              onToggle={onToggle}
              place={{ x: 0, y: 0, heightM, depthM, thicknessM, zM: 0 }}
              gap={gapM}
              thickness={frontThicknessM}
              integratedHandle={integratedHandles}
              hardware={hardware}
              parts={parts}
              lookOf={(part) => leafLook?.(part)}
              frontMaterial={frontMaterial}
              onActive={onActive}
              showFronts={layers.fronts}
              showHandles={showHandles}
              {...(legSide ? { legSide } : {})}
            />
          );
        }
        if (leaf.kind === 'bifold') {
          const showHandles = boxShown({ material: 'metal', node: 'handle', part: leaf.id }, layers);
          if (!layers.fronts && !showHandles) return null;
          return (
            <InteractiveBifold
              key={leaf.id}
              id={leaf.id}
              unit={unit}
              open={isOpen(leaf.id)}
              onToggle={onToggle}
              place={{ x: 0, y: 0, heightM, depthM, thicknessM, zM: 0 }}
              gap={gapM}
              thickness={frontThicknessM}
              integratedHandle={integratedHandles}
              hardware={hardware}
              parts={parts}
              frontMaterial={look?.material ?? frontMaterial}
              relief={look?.relief}
              onActive={onActive}
              showFronts={layers.fronts}
              showHandles={showHandles}
              {...(legSide ? { legSide } : {})}
            />
          );
        }
        const riders = localBoxesOf(leaf.id)?.filter(
          (box) =>
            (box.material === 'metal' && (box.node === 'hinge' || box.node === 'lift' || box.node === 'handle')) ||
            /* Дверь витрины в раме: едут рама и её стекло. */
            (leaf.glass === true && (box.node === 'frame' || (box.material === 'glass' && box.node === 'glass'))),
        );
        /* Ни полотна, ни седоков в кадре — показывать и нажимать нечего. */
        if (!layers.fronts && (riders?.length ?? 0) === 0) return null;
        return (
          <InteractiveDoor
            key={leaf.id}
            id={leaf.id}
            open={isOpen(leaf.id)}
            onToggle={onToggle}
            opening={leaf.opening}
            x={leaf.xM}
            y={leaf.bottomM}
            width={leaf.widthM}
            height={leaf.heightM}
            depth={depthM}
            thickness={frontThicknessM}
            parts={parts}
            gap={gapM}
            onActive={onActive}
            frontMaterial={look?.material ?? frontMaterial}
            relief={look?.relief}
            reliefOrient={gripOrient(look?.relief, leaf.opening, isUpperRow(unit))}
            riders={riders}
            panelless={leaf.glass === true}
            showPanel={layers.fronts}
            glassMaterial={glassMaterial}
          />
        );
      })}

      {/* Ящики отсеков (R02A): каждый своим ключом, открывается сам по себе. */}
      {bayDrawers.filter(([, boxes]) => boxes.length > 0).map(([id, boxes]) => (
        <InteractiveBayDrawer
          key={id}
          id={id}
          open={isOpen(id)}
          onToggle={onToggle}
          boxes={boxes}
          parts={parts}
          frontMaterial={lookOf(id)?.material ?? frontMaterial}
          onActive={onActive}
        />
      ))}
    </group>
  );
}
