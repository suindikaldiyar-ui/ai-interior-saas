'use client';

import * as THREE from 'three';

import { sceneLeaves } from '@/lib/millwork/cabinetBoxes';
import InteractiveDoor from './InteractiveDoor';
import InteractiveBifold from './InteractiveBifold';
import InteractiveDrawer from './InteractiveDrawer';
import type { CabinetParts } from './parts';
import type { Module } from '@/types/millwork';

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
   * ДОСТУПНАЯ ШИРИНА ФАСАДА У СЛЕПОГО УГЛА, метры (слой 55): створка одна
   * и только здесь; ноль — створки нет. Пусто — модуль не у слепого угла.
   * Число — `openFrontMm`, то же, что у неподвижной отрисовки и раскроя.
   */
  openWidthM?: number;
};

/** Штанга: труба 25 мм — то, что реально ставят в шкаф. */
const ROD_DIAMETER_M = 0.025;

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
  openWidthM,
}: Props) {
  const widthM = unit.widthMm / MM;
  const fill = unit.fill;

  // Внутренние размеры считаются той же формулой, что в детализировке:
  // разойдись они — клиент увидит одно, а цех получит другое.
  const innerW = Math.max(0.05, widthM - 2 * thicknessM);
  const innerDepth = depthM - thicknessM;

  const isOpen = (id: string) => openParts.includes(id);

  const isDisplay = unit.section === 'glass_display';

  return (
    <group position={[x, y, zM]}>
      {/*
        * Корпуса здесь нет НАМЕРЕННО: боковины, дно, крыша, задняя стенка,
        * полки и перегородка уходят числами в `carcassBoxes` и рисуются
        * одним `InstancedMesh` на весь ряд. Сотня неподвижных коробок —
        * это сотня вызовов отрисовки на мебель, которая не двигается.
        */}

      {/* Штанги: труба поперёк секции. */}
      {fill?.rodsMm.map((mm) => (
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
      {isDisplay && !cutaway && (
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
              frontMaterial={frontMaterial}
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
              frontMaterial={frontMaterial}
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
            frontMaterial={frontMaterial}
          />
        );
      })}
    </group>
  );
}
