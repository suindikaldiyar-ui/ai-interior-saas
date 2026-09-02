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
  /** Подсветка витрины горит. Перед захватом кадра гаснет. */
  displayLit?: boolean;
  /** Деталь поехала: ряд убирает её из общей отрисовки. */
  onActive?: (id: string, active: boolean) => void;
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
  displayLit = true,
  onActive,
}: Props) {
  const widthM = unit.widthMm / MM;
  const fill = unit.fill;

  // Внутренние размеры считаются той же формулой, что в детализировке:
  // разойдись они — клиент увидит одно, а цех получит другое.
  const innerW = Math.max(0.05, widthM - 2 * thicknessM);
  const innerDepth = depthM - thicknessM;

  const isOpen = (id: string) => openParts.includes(id);

  /*
   * Что видно в кадре. Встроенный холодильник закрыт фасадом, как обычный
   * модуль; отдельностоящий стоит на виду целиком — это разные деньги и
   * разный вид, и путать их нельзя.
   */
  const visibleAppliance =
    Boolean(unit.appliance) &&
    !unit.column &&
    (VISIBLE_APPLIANCES.has(unit.appliance as string) || unit.builtIn === false);

  const isDisplay = unit.section === 'glass_display';

  return (
    <group position={[x, y, 0]}>
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

      {/* Ящики: каждый едет сам, пока едет. */}
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
              onActive={onActive}
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
        !visibleAppliance &&
        !unit.column &&
        !isDisplay &&
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
              onActive={onActive}
            />
          );
        })}
    </group>
  );
}
