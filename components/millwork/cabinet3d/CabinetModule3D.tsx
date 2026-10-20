'use client';

import * as THREE from 'three';

import { useMemo } from 'react';
import { bayDrawerBoxes, boxShown, sceneLeaves, type PartBox } from '@/lib/millwork/cabinetBoxes';
import { ALL_LAYERS, type SceneLayers } from '@/lib/millwork/sceneLayers';
import { ROD_VISUAL_DIAMETER_MM } from '@/lib/millwork/bays';
import type { ProductionSettings } from '@/types/catalog';
import InteractiveBayDrawer from './InteractiveBayDrawer';
import InteractiveDoor from './InteractiveDoor';
import InteractiveBifold from './InteractiveBifold';
import InteractiveDrawer from './InteractiveDrawer';
import type { CabinetParts } from './parts';
import type { FrontRelief, Module } from '@/types/millwork';

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
  /** Школа цеха ряда: по ней `bayLayout` считает ящики отсеков — те же числа, что в пачке (R02A). */
  production?: ProductionSettings;
  /**
   * Слои вида (P1). Подвижная деталь выключенного слоя не рисуется и не
   * ловит нажатие: открыть невидимую створку нельзя. Слой — той же
   * `boxLayer`, что у неподвижной пачки.
   */
  layers?: SceneLayers;
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
  production,
  layers = ALL_LAYERS,
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

  const isDisplay = unit.section === 'glass_display';

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
    return Array.from(byDrawer.entries());
  }, [unit, heightM, depthM, thicknessM, gapM, frontThicknessM, integratedHandles, cutaway, production, layers]);

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
        * ВИТРИНА: стеклянная дверь в раме и лента по контуру. Подсветка
        * гаснет перед захватом кадра — светящаяся полоса в clay читается
        * моделью как часть мебели.
        */}
      {isDisplay && !cutaway && layers.fronts && (
        <>
          <mesh
            geometry={parts.box}
            material={parts.glass}
            position={[widthM / 2, heightM / 2, frontThicknessM / 2]}
            scale={[widthM - 2 * gapM, heightM - 2 * gapM, frontThicknessM]}
          />
          {/* Рама: планки по верху и низу стекла. */}
          {(
            [
              [widthM / 2, gapM + 0.02, widthM, 0.04],
              [widthM / 2, heightM - gapM - 0.02, widthM, 0.04],
            ] as [number, number, number, number][]
          ).map(([cx, cy, w, h]) => (
            <mesh
              key={`frame-${cy}`}
              geometry={parts.box}
              material={parts.metal}
              position={[cx, cy, frontThicknessM]}
              scale={[w, h, frontThicknessM]}
            />
          ))}
          {displayLit && (
            <mesh
              geometry={parts.box}
              material={parts.glow}
              position={[widthM / 2, heightM - thicknessM * 1.5, -depthM / 2]}
              scale={[widthM - 2 * thicknessM, 0.012, depthM - thicknessM]}
            />
          )}
        </>
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
      {sceneLeaves(unit, heightM, openWidthM).map((leaf) => {
        /*
         * Слой фасадов выключен — подвижного полотна нет вовсе: его нельзя
         * ни увидеть, ни нажать. Короб ящика остаётся в пачке слоя «Ящики».
         */
        if (!layers.fronts) return null;
        const look = lookOf(leaf.id);
        if (leaf.kind === 'drawer') {
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
              integratedHandle={integratedHandles}
              onActive={onActive}
              frontMaterial={look?.material ?? frontMaterial}
              relief={look?.relief}
            />
          );
        }
        if (cutaway) return null;
        if (leaf.kind === 'bifold') {
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
              parts={parts}
              frontMaterial={look?.material ?? frontMaterial}
              relief={look?.relief}
              onActive={onActive}
            />
          );
        }
        return (
          <InteractiveDoor
            key={leaf.id}
            id={leaf.id}
            open={isOpen(leaf.id)}
            onToggle={onToggle}
            opening={leaf.opening}
            x={leaf.xM}
            y={0}
            width={leaf.widthM}
            height={heightM}
            depth={depthM}
            thickness={frontThicknessM}
            parts={parts}
            gap={gapM}
            integratedHandle={integratedHandles}
            onActive={onActive}
            frontMaterial={look?.material ?? frontMaterial}
            relief={look?.relief}
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
