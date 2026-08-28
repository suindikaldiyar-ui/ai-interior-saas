'use client';

import InteractiveDoor from './InteractiveDoor';
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
  thicknessM: number;
  parts: CabinetParts;
  openParts: string[];
  onToggle: (id: string) => void;
  cutaway: boolean;
};

/** Штанга: труба 25 мм — то, что реально ставят в шкаф. */
const ROD_DIAMETER_M = 0.025;

/**
 * Техника, которую ВИДНО в кадре.
 *
 * Холодильник, посудомойка и мойка встроены за фасад: в реальной кухне на
 * их месте обычная дверца, а не чёрная плита. Тёмными остаются только те
 * приборы, у которых своя лицевая панель, — духовка, варочная, вытяжка.
 * Без этого ряд из семи модулей читается как стена чёрных слэбов.
 */
const VISIBLE_APPLIANCES = new Set(['oven', 'hob', 'hood', 'microwave']);

export default function CabinetModule3D({
  unit,
  gapM,
  frontThicknessM,
  integratedHandles,
  x,
  y,
  heightM,
  depthM,
  thicknessM,
  parts,
  openParts,
  onToggle,
  cutaway,
}: Props) {
  const widthM = unit.widthMm / MM;
  const fill = unit.fill;

  // Внутренние размеры считаются той же формулой, что в детализировке:
  // разойдись они — клиент увидит одно, а цех получит другое.
  const innerW = Math.max(0.05, widthM - 2 * thicknessM);
  const innerDepth = depthM - thicknessM;

  const isOpen = (id: string) => openParts.includes(id);

  return (
    <group position={[x, y, 0]}>
      {/* Боковины */}
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[thicknessM / 2, heightM / 2, -depthM / 2]}
        scale={[thicknessM, heightM, depthM]}
        receiveShadow
      />
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[widthM - thicknessM / 2, heightM / 2, -depthM / 2]}
        scale={[thicknessM, heightM, depthM]}
        receiveShadow
      />

      {/* Дно и крыша */}
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[widthM / 2, thicknessM / 2, -depthM / 2]}
        scale={[innerW, thicknessM, depthM]}
      />
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[widthM / 2, heightM - thicknessM / 2, -depthM / 2]}
        scale={[innerW, thicknessM, depthM]}
      />

      {/* Задняя стенка */}
      <mesh
        geometry={parts.box}
        material={parts.carcass}
        position={[widthM / 2, heightM / 2, -depthM + 0.004]}
        scale={[widthM, heightM, 0.004]}
      />

      {/* Полки — ровно на тех высотах, что стоят на чертеже. */}
      {fill?.shelves.map((mm) => (
        <mesh
          key={`shelf-${mm}`}
          geometry={parts.box}
          material={parts.carcass}
          position={[widthM / 2, mm / MM, -depthM / 2 - 0.01]}
          scale={[innerW - 0.002, thicknessM, innerDepth]}
          receiveShadow
        />
      ))}

      {/* Вертикальная перегородка */}
      {fill && fill.dividerMm > 0 && (
        <mesh
          geometry={parts.box}
          material={parts.carcass}
          position={[fill.dividerMm / MM, heightM / 2, -depthM / 2 - 0.01]}
          scale={[thicknessM, heightM - 2 * thicknessM, innerDepth]}
        />
      )}

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
        * Техника: тёмный блок в нише, а не плита во всю ширину. Утопленный
        * на два сантиметра, он оставляет видимой кромку корпуса — иначе
        * колонна читается как чёрный монолит, а не как встроенный прибор.
        */}
      {unit.appliance && VISIBLE_APPLIANCES.has(unit.appliance) && (
        <>
          <mesh
            geometry={parts.box}
            material={parts.appliance}
            position={[widthM / 2, heightM / 2, -depthM / 2 + 0.01]}
            scale={[widthM - 0.05, heightM - 0.05, depthM - 0.06]}
            castShadow
          />
          {/* Панель управления: по ней прибор узнаётся без подписи. */}
          <mesh
            geometry={parts.box}
            material={parts.metal}
            position={[widthM / 2, heightM - 0.09, -depthM / 2 + 0.03]}
            scale={[widthM - 0.09, 0.02, 0.01]}
          />
        </>
      )}

      {/* Ящики: каждый едет сам. */}
      {!unit.appliance &&
        fill?.drawerHeights.map((frontMm, i) => {
          // Высоты идут сверху вниз, а сцена считает от пола.
          const above = fill.drawerHeights.slice(0, i).reduce((sum, h) => sum + h, 0);
          const bottomMm = Math.max(0, (heightM * MM - above - frontMm));
          const id = `${unit.id}:drawer:${i}`;

          return (
            <InteractiveDrawer
              key={id}
              id={id}
              open={isOpen(id)}
              onToggle={onToggle}
              x={0}
              y={bottomMm / MM}
              width={widthM}
              height={frontMm / MM}
              depth={innerDepth}
              thickness={frontThicknessM}
              parts={parts}
              cutaway={cutaway}
              gap={gapM}
              integratedHandle={integratedHandles}
            />
          );
        })}

      {/*
        * Двери. В разрезе их нет вовсе.
        *
        * Встроенная техника (холодильник, посудомойка, мойка) закрыта
        * фасадом наравне с обычным модулем: так это и выглядит в квартире.
        */}
      {!cutaway &&
        (!unit.appliance || !VISIBLE_APPLIANCES.has(unit.appliance)) &&
        Array.from({ length: Math.max(1, unit.doorCount) }, (_, i) => {
          const doors = Math.max(1, unit.doorCount);
          const doorW = widthM / doors;
          const id = `${unit.id}:door:${i}`;

          /*
           * У двустворчатого модуля стороны очевидны: левая створка на левой
           * петле, правая на правой. У одностворчатого сторону задаёт `fill`,
           * и она обязана совпасть с треугольником на чертеже.
           */
          const hinge =
            doors > 1
              ? i === 0
                ? ('left' as const)
                : ('right' as const)
              : fill?.hinge === 'right'
                ? ('right' as const)
                : ('left' as const);

          return (
            <InteractiveDoor
              key={id}
              id={id}
              open={isOpen(id)}
              onToggle={onToggle}
              hinge={hinge}
              x={i * doorW}
              y={0}
              width={doorW}
              height={heightM}
              depth={depthM}
              thickness={frontThicknessM}
              parts={parts}
              gap={gapM}
              integratedHandle={integratedHandles}
            />
          );
        })}
    </group>
  );
}
