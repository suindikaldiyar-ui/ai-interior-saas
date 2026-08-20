'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import {
  KITCHEN,
  modulesFromRun,
  planModules,
  readKitchenMeta,
  secondaryRunLength,
  upperRowSegments,
  type KitchenMeta,
  type KitchenModule,
} from '@/lib/kitchen';
import { deg } from '@/lib/spatial';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { FurnitureItem } from '@/types/interior';

/** Радиус скругления зажимаем — фасад тоньше 2 см, иначе геометрия вывернется. */
function rr(w: number, h: number, d: number, r: number): number {
  return Math.max(0.001, Math.min(r, Math.min(w, h, d) / 2 - 0.002));
}

function tint(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.lerp(new THREE.Color(amount >= 0 ? '#ffffff' : '#000000'), Math.abs(amount));
  return `#${color.getHexString()}`;
}

const CARCASS = '#D9D6D0';
const PLINTH = '#2C2F31';
const DARK = '#16191B';
const STEEL = '#9BA1A6';

const BODY_HEIGHT =
  KITCHEN.baseHeight - KITCHEN.plinthHeight - KITCHEN.counterThickness; // 0.71

type Palette = {
  facade: string;
  facadeRough: number;
  counter: string;
  apron: string;
};

/* ─────────────────────────  Мелкие детали  ───────────────────────── */

function Handle({
  module,
  y,
  z,
  type,
}: {
  module: KitchenModule;
  y: number;
  z: number;
  type: KitchenMeta['handleType'];
}) {
  if (type === 'none') return null;

  if (type === 'rail') {
    return (
      <mesh position={[module.centerX, y, z + 0.02]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.008, 0.008, Math.min(0.32, module.width * 0.6), 10]} />
        <meshStandardMaterial color={STEEL} roughness={0.35} metalness={0.85} />
      </mesh>
    );
  }

  // Профиль-ручка: тонкая планка во всю ширину фасада.
  return (
    <mesh position={[module.centerX, y, z + 0.012]} castShadow>
      <boxGeometry args={[module.width - 0.02, 0.018, 0.014]} />
      <meshStandardMaterial color={STEEL} roughness={0.4} metalness={0.7} />
    </mesh>
  );
}

/** Фасад нижнего модуля: сплошной, ящики или дверца — по роли модуля. */
function BaseFacade({
  module,
  palette,
  handle,
}: {
  module: KitchenModule;
  palette: Palette;
  handle: KitchenMeta['handleType'];
}) {
  const z = KITCHEN.baseDepth / 2 + KITCHEN.facadeThickness / 2;
  const width = module.width - KITCHEN.gap - 0.006;
  const bottom = KITCHEN.plinthHeight;

  // Под мойкой и варочной панелью — сплошной фасад без ручки:
  // там нет ящиков, туда уходит сифон и коммуникации.
  const solid = module.role === 'sink' || module.role === 'hob';

  if (module.role === 'fridge') {
    const height = KITCHEN.fridgeHeight - KITCHEN.plinthHeight;
    return (
      <group>
        <mesh position={[module.centerX, bottom + height / 2, KITCHEN.baseDepth / 2 - 0.01]} castShadow receiveShadow>
          <boxGeometry args={[width, height, KITCHEN.baseDepth - 0.02]} />
          <meshStandardMaterial color={tint(STEEL, 0.15)} roughness={0.35} metalness={0.6} />
        </mesh>
        {/* Разрез на морозильную камеру */}
        <mesh position={[module.centerX, bottom + height * 0.32, z]}>
          <boxGeometry args={[width, 0.006, 0.01]} />
          <meshStandardMaterial color={DARK} roughness={0.6} />
        </mesh>
      </group>
    );
  }

  if (module.hasOven) {
    const ovenHeight = 0.6;
    const restHeight = BODY_HEIGHT - ovenHeight;
    return (
      <group>
        <mesh position={[module.centerX, bottom + ovenHeight / 2, z]} castShadow>
          <boxGeometry args={[width, ovenHeight, KITCHEN.facadeThickness]} />
          <meshStandardMaterial color={DARK} roughness={0.25} metalness={0.5} />
        </mesh>
        <mesh position={[module.centerX, bottom + ovenHeight * 0.72, z + 0.012]}>
          <boxGeometry args={[width - 0.06, 0.22, 0.006]} />
          <meshStandardMaterial color="#2B3033" roughness={0.1} metalness={0.2} />
        </mesh>
        {restHeight > 0.05 && (
          <RoundedBox
            args={[width, restHeight - KITCHEN.gap, KITCHEN.facadeThickness]}
            radius={rr(width, restHeight, KITCHEN.facadeThickness, 0.004)}
            smoothness={2}
            position={[module.centerX, bottom + ovenHeight + restHeight / 2, z]}
            castShadow
          >
            <meshStandardMaterial color={palette.facade} roughness={palette.facadeRough} />
          </RoundedBox>
        )}
      </group>
    );
  }

  if (solid || !module.drawers) {
    return (
      <group>
        <RoundedBox
          args={[width, BODY_HEIGHT - KITCHEN.gap, KITCHEN.facadeThickness]}
          radius={rr(width, BODY_HEIGHT, KITCHEN.facadeThickness, 0.005)}
          smoothness={2}
          position={[module.centerX, bottom + BODY_HEIGHT / 2, z]}
          castShadow
        >
          <meshStandardMaterial color={palette.facade} roughness={palette.facadeRough} />
        </RoundedBox>
        {!solid && (
          <Handle module={module} y={bottom + BODY_HEIGHT - 0.05} z={z} type={handle} />
        )}
      </group>
    );
  }

  // Три ящика — детерминированная раскладка, без случайных высот.
  const drawerHeight = (BODY_HEIGHT - KITCHEN.gap * 3) / 3;
  return (
    <group>
      {[0, 1, 2].map((i) => {
        const y = bottom + KITCHEN.gap + i * (drawerHeight + KITCHEN.gap) + drawerHeight / 2;
        return (
          <group key={i}>
            <RoundedBox
              args={[width, drawerHeight, KITCHEN.facadeThickness]}
              radius={rr(width, drawerHeight, KITCHEN.facadeThickness, 0.004)}
              smoothness={2}
              position={[module.centerX, y, z]}
              castShadow
            >
              <meshStandardMaterial color={palette.facade} roughness={palette.facadeRough} />
            </RoundedBox>
            <Handle module={module} y={y + drawerHeight / 2 - 0.03} z={z} type={handle} />
          </group>
        );
      })}
    </group>
  );
}

/* ─────────────────────────  Ряд гарнитура  ───────────────────────── */

function BaseRow({
  length,
  modules,
  palette,
  meta,
}: {
  length: number;
  modules: KitchenModule[];
  palette: Palette;
  meta: KitchenMeta;
}) {
  const depth = KITCHEN.baseDepth;
  const counterY = KITCHEN.baseHeight - KITCHEN.counterThickness / 2;

  return (
    <group>
      {/* Цоколь: сплошная тёмная планка, утоплена вглубь */}
      <mesh
        position={[0, KITCHEN.plinthHeight / 2, -depth / 2 + (depth - KITCHEN.plinthInset) / 2]}
        receiveShadow
      >
        <boxGeometry args={[length, KITCHEN.plinthHeight, depth - KITCHEN.plinthInset]} />
        <meshStandardMaterial color={PLINTH} roughness={0.8} />
      </mesh>

      {/* Корпуса */}
      {modules.map((module, i) =>
        module.role === 'fridge' ? null : (
          <mesh
            key={`c${i}`}
            position={[module.centerX, KITCHEN.plinthHeight + BODY_HEIGHT / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[module.width - KITCHEN.gap, BODY_HEIGHT, depth]} />
            <meshStandardMaterial color={CARCASS} roughness={0.75} />
          </mesh>
        ),
      )}

      {/* Фасады */}
      {modules.map((module, i) => (
        <BaseFacade key={`f${i}`} module={module} palette={palette} handle={meta.handleType} />
      ))}

      {/* Столешница — единая плита поверх всего ряда, со свесом вперёд */}
      <mesh
        position={[
          0,
          counterY,
          -depth / 2 + (depth + KITCHEN.counterOverhang) / 2,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[length, KITCHEN.counterThickness, depth + KITCHEN.counterOverhang]}
        />
        <meshStandardMaterial color={palette.counter} roughness={0.28} metalness={0.05} />
      </mesh>

      {/* Врезки: мойка и варочная панель — тёмные прямоугольники с утоплением */}
      {modules
        .filter((m) => m.role === 'sink' || m.role === 'hob')
        .map((module, i) => (
          <mesh
            key={`i${i}`}
            position={[module.centerX, KITCHEN.baseHeight - 0.006, -0.02]}
            receiveShadow
          >
            <boxGeometry
              args={[
                Math.min(module.width - 0.08, 0.56),
                0.012,
                module.role === 'sink' ? 0.42 : 0.48,
              ]}
            />
            <meshStandardMaterial
              color={module.role === 'sink' ? STEEL : DARK}
              roughness={module.role === 'sink' ? 0.3 : 0.15}
              metalness={module.role === 'sink' ? 0.8 : 0.3}
            />
          </mesh>
        ))}

      {/* Смеситель над мойкой */}
      {modules
        .filter((m) => m.role === 'sink')
        .map((module, i) => (
          <mesh
            key={`t${i}`}
            position={[module.centerX, KITCHEN.baseHeight + 0.14, -depth / 2 + 0.1]}
            castShadow
          >
            <cylinderGeometry args={[0.016, 0.018, 0.28, 10]} />
            <meshStandardMaterial color={STEEL} roughness={0.25} metalness={0.9} />
          </mesh>
        ))}
    </group>
  );
}

function UpperRow({
  segments,
  palette,
  meta,
}: {
  segments: [number, number][];
  palette: Palette;
  meta: KitchenMeta;
}) {
  const depth = KITCHEN.upperDepth;
  const z = -KITCHEN.baseDepth / 2 + depth / 2;

  return (
    <group>
      {segments.map(([from, to], si) => {
        const length = to - from;
        const center = (from + to) / 2;
        const modules = planModules(length, { ...meta, appliances: [] });

        return (
          <group key={si} position={[center, 0, 0]}>
            <mesh
              position={[0, meta.upperBottomY + KITCHEN.upperHeight / 2, z]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[length, KITCHEN.upperHeight, depth]} />
              <meshStandardMaterial color={CARCASS} roughness={0.75} />
            </mesh>

            {modules.map((module, i) => {
              const width = module.width - KITCHEN.gap - 0.006;
              const facadeZ = z + depth / 2 + KITCHEN.facadeThickness / 2;
              return (
                <group key={i}>
                  <RoundedBox
                    args={[width, KITCHEN.upperHeight - KITCHEN.gap, KITCHEN.facadeThickness]}
                    radius={rr(width, KITCHEN.upperHeight, KITCHEN.facadeThickness, 0.005)}
                    smoothness={2}
                    position={[
                      module.centerX,
                      meta.upperBottomY + KITCHEN.upperHeight / 2,
                      facadeZ,
                    ]}
                    castShadow
                  >
                    <meshStandardMaterial
                      color={palette.facade}
                      roughness={palette.facadeRough}
                    />
                  </RoundedBox>
                  <Handle
                    module={module}
                    y={meta.upperBottomY + 0.05}
                    z={facadeZ}
                    type={meta.handleType}
                  />
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

/** Фартук: панель от столешницы до низа верхнего ряда, свой материал. */
function Apron({ length, palette, meta }: { length: number; palette: Palette; meta: KitchenMeta }) {
  const height = Math.max(0.1, meta.upperBottomY - KITCHEN.baseHeight);
  return (
    <mesh
      position={[0, KITCHEN.baseHeight + height / 2, -KITCHEN.baseDepth / 2 + 0.008]}
      receiveShadow
    >
      <boxGeometry args={[length, height, 0.016]} />
      <meshStandardMaterial color={palette.apron} roughness={0.25} metalness={0.05} />
    </mesh>
  );
}

/* ─────────────────────────  Гарнитур целиком  ───────────────────────── */

export default function KitchenUnit({ item }: { item: FurnitureItem }) {
  const room = useInteriorStore((s) => s.room);

  const meta = useMemo(
    () => readKitchenMeta(item.meta as Record<string, unknown> | undefined),
    [item.meta],
  );

  const palette: Palette = useMemo(
    () => ({
      facade: meta.facadeColor ?? item.material.color,
      facadeRough: meta.facadeColor ? 0.35 : 0.5,
      counter: meta.counterColor ?? '#C9C6C0',
      apron: meta.apronColor ?? '#E4E1DA',
    }),
    [meta.facadeColor, meta.counterColor, meta.apronColor, item.material.color],
  );

  const primaryLength = item.dimensions.width;
  const secondary = secondaryRunLength(meta);
  const boxDepth = item.dimensions.depth;

  /*
   * Если у объекта есть раскладка конфигуратора, меш строится ИЗ НЕЁ.
   * Тогда 3D, чертёж и смета показывают одну и ту же мебель. Своя разбивка
   * остаётся запасным путём для сцены, собранной ассистентом без замера.
   */
  const primaryModules = useMemo(() => {
    const fromRun = (item.meta as Record<string, unknown> | undefined)?.runModules;
    if (Array.isArray(fromRun) && fromRun.length > 0) {
      return modulesFromRun(fromRun as never, primaryLength);
    }
    return planModules(primaryLength, meta);
  }, [item.meta, primaryLength, meta]);

  // Второй ряд строится тем же кодом, но повёрнут на 90° и укорочен на
  // глубину первого — иначе в углу получилось бы наложение.
  const secondaryModules = useMemo(
    () =>
      secondary > 0.1
        ? planModules(secondary, { ...meta, appliances: [], side: meta.side })
        : [],
    [secondary, meta],
  );

  // Первый ряд прижат к дальней грани габаритного бокса.
  const primaryZ = -boxDepth / 2 + KITCHEN.baseDepth / 2;

  const upperSegments = useMemo(() => {
    if (!meta.hasUpper) return [];
    return upperRowSegments(
      item,
      room,
      primaryLength,
      primaryZ - KITCHEN.baseDepth / 2 + KITCHEN.upperDepth / 2,
      meta,
    );
  }, [item, room, primaryLength, primaryZ, meta]);

  const sideSign = meta.side === 'left' ? -1 : 1;
  const sideX = sideSign * (primaryLength / 2 - KITCHEN.baseDepth / 2);
  const sideZ = primaryZ + KITCHEN.baseDepth / 2 + secondary / 2;

  return (
    <group>
      {/* Основной ряд вдоль X */}
      <group position={[0, 0, primaryZ]}>
        <BaseRow length={primaryLength} modules={primaryModules} palette={palette} meta={meta} />
        <Apron length={primaryLength} palette={palette} meta={meta} />
        {meta.hasUpper && (
          <UpperRow segments={upperSegments} palette={palette} meta={meta} />
        )}
      </group>

      {/* Второй ряд: тот же код, поворот на 90° */}
      {secondaryModules.length > 0 && (
        <group position={[sideX, 0, sideZ]} rotation={[0, deg(sideSign * -90), 0]}>
          <BaseRow
            length={secondary}
            modules={secondaryModules}
            palette={palette}
            meta={meta}
          />
          <Apron length={secondary} palette={palette} meta={meta} />
        </group>
      )}

      {/* Третий ряд у П-образной раскладки — зеркально второму */}
      {meta.layout === 'u_shape' && secondaryModules.length > 0 && (
        <group
          position={[-sideX, 0, sideZ]}
          rotation={[0, deg(sideSign * 90), 0]}
        >
          <BaseRow
            length={secondary}
            modules={secondaryModules}
            palette={palette}
            meta={meta}
          />
          <Apron length={secondary} palette={palette} meta={meta} />
        </group>
      )}
    </group>
  );
}
