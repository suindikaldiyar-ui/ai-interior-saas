'use client';

import { useEffect, useMemo, type ComponentType } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import KitchenUnit from '@/components/KitchenUnit';
import { HELPER_FLAG } from '@/lib/captureRegistry';
import { PBR } from '@/lib/furnitureCatalog';
import { deg } from '@/lib/spatial';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { FurnitureItem, MaterialSpec } from '@/types/interior';

const SELECT_COLOR = '#E0A92E';

/**
 * Радиус скругления RoundedBox обязан быть меньше половины минимальной стороны,
 * иначе геометрия выворачивается на тонких предметах (ковёр 2 см, экран ТВ 6 см).
 */
function rr(w: number, h: number, d: number, r: number): number {
  const limit = Math.min(w, h, d) / 2 - 0.002;
  return Math.max(0.001, Math.min(r, limit));
}

/** Осветлить (amount > 0) или затемнить (amount < 0) цвет. */
function tint(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(amount >= 0 ? '#ffffff' : '#000000'), Math.abs(amount));
  return `#${c.getHexString()}`;
}

/** Детерминированный псевдослучай — сцена обязана выглядеть одинаково между рендерами. */
function prand(i: number, salt = 1): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ─────────────────────────  Материал  ───────────────────────── */

type MatProps = {
  spec: MaterialSpec;
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
};

function Mat({ spec, color, roughness, metalness, opacity }: MatProps) {
  const pbr = PBR[spec.preset] ?? PBR.plaster;
  const c = color ?? spec.color;
  const rough = roughness ?? spec.roughness ?? pbr.roughness;
  const metal = metalness ?? spec.metalness ?? pbr.metalness;
  const op = opacity ?? spec.opacity ?? 1;

  if (spec.preset === 'glass') {
    return (
      <meshPhysicalMaterial
        color={c}
        transmission={0.94}
        thickness={0.05}
        ior={1.45}
        roughness={0.05}
        metalness={0}
        transparent
        opacity={op}
      />
    );
  }

  if (pbr.clearcoat !== undefined || pbr.sheen !== undefined) {
    return (
      <meshPhysicalMaterial
        color={c}
        roughness={rough}
        metalness={metal}
        clearcoat={pbr.clearcoat ?? 0}
        clearcoatRoughness={0.28}
        sheen={pbr.sheen ?? 0}
        sheenColor={tint(c, 0.25)}
        sheenRoughness={0.85}
        transparent={op < 1}
        opacity={op}
      />
    );
  }

  return (
    <meshStandardMaterial
      color={c}
      roughness={rough}
      metalness={metal}
      transparent={op < 1}
      opacity={op}
    />
  );
}

/* ─────────────────────────  Примитивы-хелперы  ───────────────────────── */

type Triple = [number, number, number];

function B({
  args,
  position,
  rotation,
  spec,
  color,
  roughness,
  metalness,
  opacity,
  cast = true,
  receive = true,
}: {
  args: Triple;
  position?: Triple;
  rotation?: Triple;
  spec: MaterialSpec;
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  cast?: boolean;
  receive?: boolean;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow={cast} receiveShadow={receive}>
      <boxGeometry args={args} />
      <Mat spec={spec} color={color} roughness={roughness} metalness={metalness} opacity={opacity} />
    </mesh>
  );
}

function RB({
  args,
  radius,
  position,
  rotation,
  spec,
  color,
}: {
  args: Triple;
  radius: number;
  position?: Triple;
  rotation?: Triple;
  spec: MaterialSpec;
  color?: string;
}) {
  const [w, h, d] = args;
  return (
    <RoundedBox
      args={args}
      radius={rr(w, h, d, radius)}
      smoothness={3}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
    >
      <Mat spec={spec} color={color} />
    </RoundedBox>
  );
}

function C({
  args,
  position,
  rotation,
  spec,
  color,
  metalness,
  roughness,
  openEnded = false,
}: {
  args: [number, number, number, number];
  position?: Triple;
  rotation?: Triple;
  spec: MaterialSpec;
  color?: string;
  metalness?: number;
  roughness?: number;
  openEnded?: boolean;
}) {
  const [rt, rb, h, seg] = args;
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, seg, 1, openEnded]} />
      <Mat spec={spec} color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

const LEG: MaterialSpec = { preset: 'metal', color: '#2E3134' };

/* ─────────────────────────  Мягкая мебель  ───────────────────────── */

type ArmMode = 'both' | 'left' | 'right' | 'none';

function SofaBlock({
  w,
  h,
  d,
  spec,
  seats = 2,
  arms = 'both',
}: {
  w: number;
  h: number;
  d: number;
  spec: MaterialSpec;
  seats?: number;
  arms?: ArmMode;
}) {
  const legH = 0.13;
  const baseH = 0.16;
  const backD = Math.min(0.17, d * 0.22);
  const armW = arms === 'none' ? 0 : Math.min(0.19, w * 0.12);
  const armH = legH + Math.min(0.48, (h - legH) * 0.62);

  const hasLeft = arms === 'both' || arms === 'left';
  const hasRight = arms === 'both' || arms === 'right';

  const innerW = Math.max(0.3, w - (hasLeft ? armW : 0) - (hasRight ? armW : 0));
  const innerX = ((hasLeft ? armW : 0) - (hasRight ? armW : 0)) / -2;

  const seatTop = legH + baseH;
  const cushionH = 0.16;
  const seatD = Math.max(0.2, d - backD - 0.02);
  const seatZ = -d / 2 + backD + seatD / 2;

  const backTotalH = h - legH;
  const backCushionH = Math.max(0.14, h - seatTop - cushionH - 0.04);

  const n = Math.max(1, Math.round(seats));
  const gap = 0.02;
  const cw = (innerW - gap * (n - 1) - 0.04) / n;

  const legX = w / 2 - 0.1;
  const legZ = d / 2 - 0.1;

  return (
    <group>
      {/* ножки */}
      {([[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]] as const).map(
        ([lx, lz], i) => (
          <B
            key={i}
            args={[0.05, legH, 0.05]}
            position={[lx, legH / 2, lz]}
            spec={LEG}
            receive={false}
          />
        ),
      )}

      {/* каркас сиденья */}
      <RB args={[w, baseH, d]} radius={0.03} position={[0, legH + baseH / 2, 0]} spec={spec} />

      {/* спинка: rotationY = 0 → объект смотрит в +Z, значит спинка на -Z */}
      <RB
        args={[w, backTotalH, backD]}
        radius={0.04}
        position={[0, legH + backTotalH / 2, -d / 2 + backD / 2]}
        spec={spec}
      />

      {/* подлокотники */}
      {hasLeft && (
        <RB
          args={[armW, armH - legH, d]}
          radius={0.06}
          position={[-w / 2 + armW / 2, legH + (armH - legH) / 2, 0]}
          spec={spec}
          color={tint(spec.color, -0.04)}
        />
      )}
      {hasRight && (
        <RB
          args={[armW, armH - legH, d]}
          radius={0.06}
          position={[w / 2 - armW / 2, legH + (armH - legH) / 2, 0]}
          spec={spec}
          color={tint(spec.color, -0.04)}
        />
      )}

      {/* подушки сиденья */}
      {Array.from({ length: n }, (_, i) => {
        const x = innerX - innerW / 2 + 0.02 + cw / 2 + i * (cw + gap);
        return (
          <RB
            key={`s${i}`}
            args={[cw, cushionH, seatD]}
            radius={0.05}
            position={[x, seatTop + cushionH / 2, seatZ]}
            spec={spec}
            color={tint(spec.color, 0.05)}
          />
        );
      })}

      {/* подушки спинки */}
      {Array.from({ length: n }, (_, i) => {
        const x = innerX - innerW / 2 + 0.02 + cw / 2 + i * (cw + gap);
        return (
          <RB
            key={`b${i}`}
            args={[cw, backCushionH, 0.15]}
            radius={0.05}
            position={[
              x,
              seatTop + cushionH + backCushionH / 2 - 0.02,
              -d / 2 + backD + 0.075,
            ]}
            spec={spec}
            color={tint(spec.color, 0.02)}
          />
        );
      })}
    </group>
  );
}

type PartProps = { item: FurnitureItem };

function Sofa({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  return <SofaBlock w={w} h={h} d={d} spec={item.material} seats={w > 1.9 ? 3 : 2} />;
}

function Armchair({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  return <SofaBlock w={w} h={h} d={d} spec={item.material} seats={1} />;
}

function CornerSofa({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  // Основная часть вдоль X + шезлонг под 90° на правом краю.
  const mainD = Math.min(0.95, d * 0.5);
  const chaiseD = Math.max(0.6, d - mainD);
  return (
    <group>
      <group position={[0, 0, -d / 2 + mainD / 2]}>
        <SofaBlock w={w} h={h} d={mainD} spec={item.material} seats={3} arms="left" />
      </group>
      <group
        position={[w / 2 - mainD / 2, 0, -d / 2 + mainD + chaiseD / 2]}
        rotation={[0, deg(90), 0]}
      >
        <SofaBlock
          w={chaiseD}
          h={h}
          d={mainD}
          spec={item.material}
          seats={1}
          arms="right"
        />
      </group>
    </group>
  );
}

function Chair({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  const spec = item.material;
  const seatH = 0.46;
  const legX = w / 2 - 0.04;
  const legZ = d / 2 - 0.04;
  return (
    <group>
      {([[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]] as const).map(
        ([lx, lz], i) => (
          <B key={i} args={[0.04, seatH, 0.04]} position={[lx, seatH / 2, lz]} spec={spec} />
        ),
      )}
      <RB args={[w, 0.05, d]} radius={0.015} position={[0, seatH + 0.025, 0]} spec={spec} />
      <RB
        args={[w, h - seatH - 0.05, 0.05]}
        radius={0.02}
        position={[0, seatH + 0.05 + (h - seatH - 0.05) / 2, -d / 2 + 0.03]}
        spec={spec}
        color={tint(spec.color, -0.05)}
      />
    </group>
  );
}

/* ─────────────────────────  Столы  ───────────────────────── */

function TableBase({
  w,
  h,
  d,
  spec,
  topT = 0.05,
  legR = 0.03,
  inset = 0.08,
}: {
  w: number;
  h: number;
  d: number;
  spec: MaterialSpec;
  topT?: number;
  legR?: number;
  inset?: number;
}) {
  const legH = Math.max(0.05, h - topT);
  const lx = Math.max(0.02, w / 2 - inset);
  const lz = Math.max(0.02, d / 2 - inset);
  return (
    <group>
      {([[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]] as const).map(([x, z], i) => (
        <C
          key={i}
          args={[legR, legR, legH, 12]}
          position={[x, legH / 2, z]}
          spec={LEG}
        />
      ))}
      <RB args={[w, topT, d]} radius={0.012} position={[0, h - topT / 2, 0]} spec={spec} />
    </group>
  );
}

function CoffeeTable({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  return <TableBase w={w} h={h} d={d} spec={item.material} topT={0.05} inset={0.09} />;
}

function DiningTable({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  return (
    <TableBase w={w} h={h} d={d} spec={item.material} topT={0.06} legR={0.04} inset={0.12} />
  );
}

function SideTable({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  return <TableBase w={w} h={h} d={d} spec={item.material} topT={0.04} legR={0.02} inset={0.05} />;
}

/* ─────────────────────────  Ковёр  ───────────────────────── */

function Rug({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  const border = Math.min(0.24, Math.min(w, d) * 0.14);
  return (
    <group>
      <mesh position={[0, h / 2, 0]} receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <Mat spec={item.material} />
      </mesh>
      {/* внутренняя кайма — чуть светлее основного поля */}
      <mesh position={[0, h + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[Math.max(0.05, w - border * 2), Math.max(0.05, d - border * 2)]} />
        <meshStandardMaterial color={tint(item.material.color, 0.14)} roughness={1} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────  Свет  ───────────────────────── */

function FloorLamp({ item }: PartProps) {
  const { width: w, height: h } = item.dimensions;
  const shadeH = Math.min(0.3, h * 0.2);
  const shadeRB = w / 2;
  const shadeRT = shadeRB * 0.58;
  const poleH = h - shadeH;
  return (
    <group>
      <C args={[w * 0.34, w * 0.38, 0.035, 32]} position={[0, 0.018, 0]} spec={item.material} />
      <C args={[0.018, 0.018, poleH, 12]} position={[0, poleH / 2, 0]} spec={item.material} />
      <mesh position={[0, poleH + shadeH / 2, 0]} castShadow>
        <cylinderGeometry args={[shadeRT, shadeRB, shadeH, 32, 1, true]} />
        <meshStandardMaterial
          color="#F2EAD8"
          roughness={0.85}
          side={THREE.DoubleSide}
          emissive="#FFE7B8"
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh position={[0, poleH + shadeH * 0.35, 0]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color="#FFF3D6" emissive="#FFD9A0" emissiveIntensity={2.4} />
      </mesh>
      <pointLight
        position={[0, poleH + shadeH * 0.3, 0]}
        color="#FFD9A0"
        intensity={4.5}
        distance={5.5}
        decay={2}
      />
    </group>
  );
}

/** Подвес: origin — точка крепления к потолку, геометрия уходит ВНИЗ. */
function PendantLamp({ item }: PartProps) {
  const { width: w, height: h } = item.dimensions;
  const shadeH = Math.min(0.3, h * 0.34);
  const cordH = Math.max(0.05, h - shadeH);
  const shadeRB = w / 2;
  const shadeRT = shadeRB * 0.2;
  return (
    <group>
      <C args={[0.05, 0.05, 0.02, 16]} position={[0, -0.01, 0]} spec={item.material} />
      <C args={[0.008, 0.008, cordH, 8]} position={[0, -cordH / 2, 0]} spec={LEG} />
      <mesh position={[0, -cordH - shadeH / 2, 0]} castShadow>
        <cylinderGeometry args={[shadeRT, shadeRB, shadeH, 32, 1, true]} />
        <meshStandardMaterial
          color={item.material.color}
          roughness={0.35}
          metalness={0.75}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, -cordH - shadeH + 0.05, 0]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color="#FFF6E2" emissive="#FFE0AC" emissiveIntensity={2.8} />
      </mesh>
      <pointLight
        position={[0, -cordH - shadeH, 0]}
        color="#FFE0AC"
        intensity={9}
        distance={7}
        decay={2}
        castShadow
      />
    </group>
  );
}

/* ─────────────────────────  Растение  ───────────────────────── */

function Plant({ item }: PartProps) {
  const { width: w, height: h } = item.dimensions;
  const potH = h * 0.24;
  const potR = w / 2;
  const foliageH = h - potH;
  const stems = 7;
  const pot: MaterialSpec = { preset: 'porcelain', color: '#B9AE9C' };

  return (
    <group>
      <mesh position={[0, potH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[potR, potR * 0.68, potH, 28]} />
        <Mat spec={pot} />
      </mesh>
      <mesh position={[0, potH - 0.015, 0]}>
        <cylinderGeometry args={[potR * 0.94, potR * 0.94, 0.03, 24]} />
        <meshStandardMaterial color="#39302A" roughness={1} />
      </mesh>

      {Array.from({ length: stems }, (_, i) => {
        const a = (i / stems) * Math.PI * 2 + prand(i, 3) * 0.5;
        const lean = 0.18 + prand(i, 5) * 0.28;
        const len = foliageH * (0.55 + prand(i, 7) * 0.45);
        const tipX = Math.cos(a) * lean * len;
        const tipZ = Math.sin(a) * lean * len;
        return (
          <group key={i} position={[0, potH, 0]}>
            <mesh
              position={[tipX / 2, len / 2, tipZ / 2]}
              rotation={[Math.sin(a) * lean, 0, -Math.cos(a) * lean]}
              castShadow
            >
              <cylinderGeometry args={[0.008, 0.014, len, 6]} />
              <meshStandardMaterial color="#4A6B3C" roughness={0.85} />
            </mesh>
            {[0.62, 1].map((t, j) => (
              <mesh
                key={j}
                position={[tipX * t, len * t, tipZ * t]}
                rotation={[prand(i, 11 + j) * 0.6, a, prand(i, 13 + j) * 0.5]}
                scale={[1, 0.22, 0.62]}
                castShadow
              >
                <sphereGeometry args={[0.14 + prand(i, 17 + j) * 0.07, 12, 10]} />
                <Mat spec={item.material} color={tint(item.material.color, j * 0.1 - 0.04)} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/* ─────────────────────────  Корпусная мебель  ───────────────────────── */

function Bookshelf({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  const spec = item.material;
  const t = 0.03;
  const shelves = Math.max(2, Math.round(h / 0.42));
  return (
    <group>
      <B args={[t, h, d]} position={[-w / 2 + t / 2, h / 2, 0]} spec={spec} />
      <B args={[t, h, d]} position={[w / 2 - t / 2, h / 2, 0]} spec={spec} />
      <B args={[w, h, 0.015]} position={[0, h / 2, -d / 2 + 0.008]} spec={spec} color={tint(spec.color, -0.2)} />
      {Array.from({ length: shelves + 1 }, (_, i) => (
        <B
          key={i}
          args={[w - t * 2, t, d - 0.02]}
          position={[0, Math.min(h - t / 2, (i * (h - t)) / shelves + t / 2), 0.01]}
          spec={spec}
          color={tint(spec.color, 0.05)}
        />
      ))}
      {/* корешки книг на второй и четвёртой полке */}
      {[1, 3].map((row) =>
        Array.from({ length: 9 }, (_, i) => {
          const bw = 0.03 + prand(row * 10 + i, 2) * 0.03;
          const bh = 0.2 + prand(row * 10 + i, 4) * 0.1;
          const y = (row * (h - t)) / shelves + t;
          const x = -w / 2 + t + 0.05 + i * 0.075;
          if (x > w / 2 - t - 0.05 || y + bh > h) return null;
          return (
            <mesh key={`${row}-${i}`} position={[x, y + bh / 2, 0.02]} castShadow>
              <boxGeometry args={[bw, bh, d * 0.6]} />
              <meshStandardMaterial
                color={tint(['#7C5A44', '#4E6360', '#8A7B5C', '#5C4A55'][i % 4], prand(i, row) * 0.2 - 0.1)}
                roughness={0.9}
              />
            </mesh>
          );
        }),
      )}
    </group>
  );
}

function Cabinet({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  const spec = item.material;
  const doors = w > 1 ? 2 : 1;
  const plinth = 0.06;
  return (
    <group>
      <B args={[w * 0.92, plinth, d * 0.9]} position={[0, plinth / 2, 0]} spec={spec} color={tint(spec.color, -0.3)} />
      <RB args={[w, h - plinth, d]} radius={0.01} position={[0, plinth + (h - plinth) / 2, 0]} spec={spec} />
      {Array.from({ length: doors }, (_, i) => {
        const dw = (w - 0.04) / doors - 0.01;
        const x = -w / 2 + 0.02 + dw / 2 + i * (dw + 0.01);
        return (
          <group key={i}>
            <B
              args={[dw, h - plinth - 0.04, 0.015]}
              position={[x, plinth + (h - plinth) / 2, d / 2 + 0.005]}
              spec={spec}
              color={tint(spec.color, 0.07)}
            />
            <C
              args={[0.008, 0.008, Math.min(0.24, h * 0.2), 8]}
              position={[x + dw / 2 - 0.05, plinth + (h - plinth) * 0.62, d / 2 + 0.03]}
              spec={{ preset: 'brass', color: '#B8924E' }}
            />
          </group>
        );
      })}
    </group>
  );
}

function TvUnit({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  const spec = item.material;
  const plinth = 0.05;
  const bodyH = h - plinth;
  return (
    <group>
      <B args={[w * 0.9, plinth, d * 0.85]} position={[0, plinth / 2, 0]} spec={spec} color={tint(spec.color, -0.35)} />
      <RB args={[w, bodyH, d]} radius={0.012} position={[0, plinth + bodyH / 2, 0]} spec={spec} />
      {[0, 1].map((i) => {
        const dw = w / 2 - 0.03;
        const x = -w / 4 + i * (w / 2);
        return (
          <group key={i}>
            <B
              args={[dw, bodyH - 0.06, 0.014]}
              position={[x, plinth + bodyH / 2, d / 2 + 0.006]}
              spec={spec}
              color={tint(spec.color, 0.08)}
            />
            <B
              args={[dw * 0.4, 0.012, 0.02]}
              position={[x, plinth + bodyH / 2, d / 2 + 0.02]}
              spec={{ preset: 'brass', color: '#B8924E' }}
            />
          </group>
        );
      })}
    </group>
  );
}

function Tv({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  const standH = Math.min(0.08, h * 0.12);
  const panelH = h - standH;
  return (
    <group>
      <B args={[w * 0.3, 0.015, d * 3]} position={[0, 0.008, 0]} spec={LEG} />
      <B args={[0.05, standH, 0.04]} position={[0, standH / 2, 0]} spec={LEG} />
      <RB
        args={[w, panelH, d]}
        radius={0.006}
        position={[0, standH + panelH / 2, 0]}
        spec={item.material}
      />
      <mesh position={[0, standH + panelH / 2, d / 2 + 0.002]}>
        <planeGeometry args={[w - 0.03, panelH - 0.03]} />
        <meshStandardMaterial
          color="#0E1416"
          roughness={0.14}
          metalness={0.2}
          emissive="#12303A"
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

function Bed({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  const spec = item.material;
  const frameH = 0.3;
  const mattressH = 0.26;
  const headH = h;
  const headD = 0.09;
  return (
    <group>
      <RB args={[w, frameH, d]} radius={0.02} position={[0, frameH / 2, 0]} spec={spec} color={tint(spec.color, -0.25)} />
      {/* изголовье у -Z: кровать «смотрит» в +Z */}
      <RB args={[w, headH, headD]} radius={0.03} position={[0, headH / 2, -d / 2 + headD / 2]} spec={spec} />
      <RB
        args={[w - 0.06, mattressH, d - headD - 0.06]}
        radius={0.05}
        position={[0, frameH + mattressH / 2, headD / 2]}
        spec={spec}
        color={tint(spec.color, 0.28)}
      />
      {/* одеяло */}
      <RB
        args={[w - 0.04, 0.06, (d - headD) * 0.6]}
        radius={0.02}
        position={[0, frameH + mattressH + 0.02, d / 2 - (d - headD) * 0.3]}
        spec={spec}
        color={tint(spec.color, -0.12)}
      />
      {[-1, 1].map((s) => (
        <RB
          key={s}
          args={[w * 0.42, 0.12, 0.34]}
          radius={0.055}
          position={[s * w * 0.24, frameH + mattressH + 0.06, -d / 2 + headD + 0.24]}
          spec={spec}
          color={tint(spec.color, 0.38)}
        />
      ))}
    </group>
  );
}

/* ─────────────────────────  Стена  ───────────────────────── */

/** Керамогранит: раскладка плит 0.6 × 1.2 со швом 5 мм по тёмной подложке. */
function WallPanel({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  const gapSize = 0.005;
  const cols = Math.max(1, Math.round(w / 0.6));
  const rows = Math.max(1, Math.round(h / 1.2));
  const tw = (w - gapSize * (cols - 1)) / cols;
  const th = (h - gapSize * (rows - 1)) / rows;

  return (
    <group>
      <B args={[w, h, d * 0.5]} position={[0, h / 2, -d * 0.25]} spec={{ preset: 'plaster', color: '#22262A' }} />
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const x = -w / 2 + tw / 2 + c * (tw + gapSize);
          const y = th / 2 + r * (th + gapSize);
          const shade = (prand(r * 31 + c, 9) - 0.5) * 0.09;
          return (
            <B
              key={`${r}-${c}`}
              args={[tw, th, d]}
              position={[x, y, d / 2]}
              spec={item.material}
              color={tint(item.material.color, shade)}
            />
          );
        }),
      )}
    </group>
  );
}

function WallArt({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  const f = 0.04;
  return (
    <group>
      <B args={[w, h, d]} position={[0, h / 2, 0]} spec={{ preset: 'wood_walnut', color: '#3B2E24' }} />
      <mesh position={[0, h / 2, d / 2 + 0.002]}>
        <planeGeometry args={[Math.max(0.05, w - f * 2), Math.max(0.05, h - f * 2)]} />
        <meshStandardMaterial color={item.material.color} roughness={0.95} />
      </mesh>
      <mesh position={[0, h * 0.42, d / 2 + 0.004]} rotation={[0, 0, deg(-14)]}>
        <planeGeometry args={[Math.max(0.03, w * 0.5), Math.max(0.03, h * 0.34)]} />
        <meshStandardMaterial color={tint(item.material.color, -0.35)} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Штора: плоскость с синусоидальным смещением вершин — складки ткани. */
function Curtain({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h, 48, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const amp = Math.max(0.015, d * 0.45);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin((x / w) * Math.PI * 14) * amp);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [w, h, d]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[0, h / 2, 0]} castShadow receiveShadow>
      <meshStandardMaterial
        color={item.material.color}
        roughness={0.95}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Block({ item }: PartProps) {
  const { width: w, height: h, depth: d } = item.dimensions;
  return <RB args={[w, h, d]} radius={0.02} position={[0, h / 2, 0]} spec={item.material} />;
}

/* ─────────────────────────  Карта рендереров  ───────────────────────── */

const RENDERERS: Record<string, ComponentType<PartProps>> = {
  sofa: Sofa,
  corner_sofa: CornerSofa,
  armchair: Armchair,
  chair: Chair,
  coffee_table: CoffeeTable,
  dining_table: DiningTable,
  side_table: SideTable,
  rug: Rug,
  floor_lamp: FloorLamp,
  pendant_lamp: PendantLamp,
  plant: Plant,
  tv_unit: TvUnit,
  tv: Tv,
  bookshelf: Bookshelf,
  bed: Bed,
  nightstand: Cabinet,
  wardrobe: Cabinet,
  kitchen_unit: KitchenUnit,
  wall_panel: WallPanel,
  wall_art: WallArt,
  curtain: Curtain,
  box: Block,
};

/* ─────────────────────────  Главный компонент  ───────────────────────── */

export default function FurnitureMesh({ item }: { item: FurnitureItem }) {
  const selectedId = useInteriorStore((s) => s.selectedId);
  const hoveredId = useInteriorStore((s) => s.hoveredId);
  const selectItem = useInteriorStore((s) => s.selectItem);
  const setHovered = useInteriorStore((s) => s.setHovered);
  const captureMode = useInteriorStore((s) => s.captureMode);

  const { width: w, height: h, depth: d } = item.dimensions;
  // В режиме съёмки ни каркас, ни кольцо, ни подсветка не должны попасть в кадр:
  // модель приняла бы оранжевую рамку за настоящий предмет.
  const isSelected = selectedId === item.id && !captureMode;
  const isHovered = hoveredId === item.id && !isSelected && !captureMode;

  // Габаритный каркас. Геометрия создаётся один раз на набор размеров.
  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(w, h, d);
    const e = new THREE.EdgesGeometry(box);
    box.dispose();
    return e;
  }, [w, h, d]);
  useEffect(() => () => edges.dispose(), [edges]);

  const footprintR = Math.max(w, d) / 2;
  const ring = useMemo(
    () => new THREE.RingGeometry(footprintR * 0.98, footprintR * 1.06, 56),
    [footprintR],
  );
  useEffect(() => () => ring.dispose(), [ring]);

  const Renderer = RENDERERS[item.type] ?? Block;

  if (item.visible === false) return null;

  // У подвеса origin наверху — габаритный бокс уходит вниз.
  const boxCenterY = item.placement === 'ceiling' ? -h / 2 : h / 2;
  const showRing = isSelected && item.placement !== 'ceiling' && item.placement !== 'wall';

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectItem(item.id);
  };

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(item.id);
    if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
  };

  const handleOut = () => {
    setHovered(null);
    if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
  };

  return (
    <group
      name={item.id}
      position={[item.position.x, item.position.y, item.position.z]}
      rotation={[deg(item.rotation.x), deg(item.rotation.y), deg(item.rotation.z)]}
      onClick={handleClick}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
    >
      <Renderer item={item} />

      {(isSelected || isHovered) && (
        <lineSegments
          geometry={edges}
          userData={{ [HELPER_FLAG]: true }}
          position={[0, boxCenterY, 0]}
          renderOrder={999}
        >
          <lineBasicMaterial
            color={SELECT_COLOR}
            depthTest={false}
            transparent
            opacity={isSelected ? 1 : 0.4}
          />
        </lineSegments>
      )}

      {showRing && (
        <mesh
          geometry={ring}
          userData={{ [HELPER_FLAG]: true }}
          position={[0, 0.006, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={998}
        >
          <meshBasicMaterial color={SELECT_COLOR} transparent opacity={0.55} depthTest={false} />
        </mesh>
      )}
    </group>
  );
}
