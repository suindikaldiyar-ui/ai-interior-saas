'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { PartBox } from '@/lib/millwork/cabinetBoxes';
import { panelOutlineMm, tvMountMm, tvScreenMm } from '@/lib/millwork/tvZone';
import type { TvSpec } from '@/types/millwork';

/**
 * ТВ-ЗОНА В СЦЕНЕ (STAGE B): телевизор и детали панелей со скруглёнными
 * углами. Место и габарит — коробки ряда (`runBoxes`: `node: 'tv'`, `rounded`),
 * те же, по которым идут кадр, рёбра и проверки пересечений; здесь — только
 * то, как они выглядят.
 */

const MM = 1000;

/* ─────────────────────────  Панель со скруглёнными углами  ───────────────────────── */

/**
 * ДЕТАЛЬ ПАНЕЛИ ПО КОНТУРУ — призма контура `panelOutlineMm` (та же функция
 * рисует рёбра и чертёж), выдавленная на толщину детали. Сетка — метрами от
 * центра детали: фото и рисунок дерева ложатся в настоящем размере, как у
 * коробок (`realSizeMap` берёт метры вершины).
 */
function roundedGeometry(scale: [number, number, number], corners: NonNullable<PartBox['rounded']>): THREE.BufferGeometry {
  const [w, h, d] = scale;
  const outline = panelOutlineMm(w * MM, h * MM, corners);
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x / MM, y / MM)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -d / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function RoundedPanel({ box, material, shadows }: { box: PartBox; material: THREE.Material; shadows: boolean }) {
  const [w, h, d] = box.scale;
  const corners = box.rounded!;
  const cornersKey = `${corners.r}|${corners.tl}|${corners.tr}|${corners.bl}|${corners.br}`;
  const geometry = useMemo(
    () => roundedGeometry([w, h, d], corners),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- форма меняется только с числами
    [w, h, d, cornersKey],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      name={`decor-rounded:${box.partId ?? ''}`}
      geometry={geometry}
      material={material}
      position={box.position}
      castShadow={shadows}
      receiveShadow
    />
  );
}

/** Детали панелей со скруглёнными углами — по мешу на деталь (их единицы, а не сотни). */
export function RoundedPanels({
  boxes,
  materialOf,
  shadows,
}: {
  boxes: PartBox[];
  materialOf: (box: PartBox) => THREE.Material;
  shadows: boolean;
}) {
  return (
    <>
      {boxes.map((box) => (
        <RoundedPanel key={box.partId ?? box.position.join('|')} box={box} material={materialOf(box)} shadows={shadows} />
      ))}
    </>
  );
}

/* ─────────────────────────  Телевизор  ───────────────────────── */

export type TvScreenState = 'off' | 'on' | 'demo';

/**
 * КАРТИНКА ЭКРАНА — ХОЛСТ, А НЕ ФАЙЛ: сцена работает без сети. «Включён» —
 * заставка (мягкий градиент), «демо» — условный пейзаж. Одна текстура на
 * состояние на вкладку.
 */
const screenTextures = new Map<TvScreenState, THREE.CanvasTexture>();

function screenTexture(state: Exclude<TvScreenState, 'off'>): THREE.CanvasTexture {
  const cached = screenTextures.get(state);
  if (cached) return cached;
  const width = 640;
  const height = 360;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Холст 2D недоступен: картинку экрана телевизора не нарисовать.');
  if (state === 'on') {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, '#0b1d3a');
    g.addColorStop(0.55, '#1d4f8a');
    g.addColorStop(1, '#3b8fc4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * 0.7, height * 0.35, 10, width * 0.7, height * 0.35, width * 0.5);
    glow.addColorStop(0, 'rgba(255,255,255,0.35)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  } else {
    /* Условный пейзаж: небо, солнце, горы, вода — читается «картинкой на экране» с трёх метров. */
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.62);
    sky.addColorStop(0, '#f2a65a');
    sky.addColorStop(0.6, '#f6d38b');
    sky.addColorStop(1, '#fbe8bd');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height * 0.62);
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath();
    ctx.arc(width * 0.66, height * 0.42, height * 0.09, 0, Math.PI * 2);
    ctx.fill();
    const ridge = (y: number, amp: number, color: string, phase: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 8) {
        ctx.lineTo(x, y + Math.sin(x / 70 + phase) * amp + Math.sin(x / 23 + phase * 2) * amp * 0.35);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    };
    ridge(height * 0.5, 26, '#8a6f86', 0.3);
    ridge(height * 0.57, 20, '#5b4d6b', 1.7);
    const water = ctx.createLinearGradient(0, height * 0.62, 0, height);
    water.addColorStop(0, '#3e5f86');
    water.addColorStop(1, '#16263d');
    ctx.fillStyle = water;
    ctx.fillRect(0, height * 0.62, width, height * 0.38);
    ctx.fillStyle = 'rgba(255,236,190,0.55)';
    for (let i = 0; i < 9; i += 1) ctx.fillRect(width * 0.6 + Math.sin(i) * 14, height * (0.64 + i * 0.035), width * 0.12 - i * 6, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.userData.tvScreen = state;
  screenTextures.set(state, texture);
  return texture;
}

/** Имена узлов телевизора: по ним приёмка находит его в кадре. */
export const TV_NODE = { group: 'tv', screen: 'tv-screen', body: 'tv-body', mount: 'tv-mount' } as const;

/**
 * ТЕЛЕВИЗОР — ПОКУПНОЕ ИЗДЕЛИЕ НА СТЕНЕ: тонкая панель с рамкой, корпус
 * сзади, экран-стекло с отражениями и кронштейн до стены (или панели).
 *
 * Габарит — коробка движка (`tvBoxMm`): экран по диагонали 16:9, рамка —
 * `tv.bezelMm`, толщина — `tv.depthMm`, вынос кронштейна — `tvMountMm` (до
 * выбора кронштейна — условный, и это сказано в блоке телевизора). Экран
 * светится материалом (`emissive`), источника света не ставит: новый источник
 * пересобрал бы программы всех материалов (слой 64).
 */
export function TvModel({
  box,
  tv,
  screen,
  shadows,
}: {
  box: PartBox;
  tv: TvSpec;
  screen: TvScreenState;
  shadows: boolean;
}) {
  const [w, h, d] = box.scale;
  const bezel = tv.bezelMm / MM;
  const face = Math.min(0.012, d * 0.4);
  const mount = tvMountMm(tv) / MM;
  const screenSize = tvScreenMm(tv.diagonalIn);
  /* Экран — по диагонали; рамка добирает корпус до габарита модели. */
  const sw = Math.min(w - 2 * bezel, screenSize.widthMm / MM);
  const sh = Math.min(h - 2 * bezel, screenSize.heightMm / MM);

  const materials = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.42, metalness: 0.35 }),
      bezel: new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.3, metalness: 0.2 }),
      mount: new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.38, metalness: 0.7 }),
      screen: new THREE.MeshPhysicalMaterial({
        color: '#050607',
        roughness: 0.07,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        reflectivity: 0.55,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );

  useEffect(() => {
    const material = materials.screen;
    const map = screen === 'off' ? null : screenTexture(screen);
    material.emissiveMap = map;
    material.emissive.set(map ? '#ffffff' : '#000000');
    material.emissiveIntensity = map ? (screen === 'demo' ? 1.05 : 0.9) : 0;
    material.color.set(map ? '#000000' : '#050607');
    material.needsUpdate = true;
  }, [materials, screen]);

  return (
    <group name={TV_NODE.group} position={box.position} userData={{ tvScreen: screen, diagonalIn: tv.diagonalIn }}>
      {/* Тонкая панель с рамкой — лицо телевизора. */}
      <mesh name={TV_NODE.body} position={[0, 0, d / 2 - face / 2]} material={materials.bezel} castShadow={shadows} receiveShadow>
        <boxGeometry args={[w, h, face]} />
      </mesh>
      {/* Корпус сзади: электроника, уже и ниже панели. */}
      {d - face > 0.002 && (
        <mesh name={TV_NODE.body} position={[0, -h * 0.04, -face / 2]} material={materials.body} castShadow={shadows}>
          <boxGeometry args={[w * 0.72, h * 0.62, d - face]} />
        </mesh>
      )}
      {/* Экран — стекло с лаком: отражает окружение «Интерьера», светится картинкой. */}
      <mesh name={TV_NODE.screen} position={[0, 0, d / 2 + 0.0004]} material={materials.screen}>
        <planeGeometry args={[sw, sh]} />
      </mesh>
      {/* Кронштейн до стены или панели: вынос по паспорту кронштейна или условный. */}
      {mount > 0.001 && (
        <mesh name={TV_NODE.mount} position={[0, -h * 0.04, -d / 2 - mount / 2]} material={materials.mount} castShadow={shadows}>
          <boxGeometry args={[Math.min(0.4, w * 0.45), Math.min(0.3, h * 0.45), mount]} />
        </mesh>
      )}
    </group>
  );
}
