'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoxDraw, HandleDraw } from '@/lib/millwork/cabinetBoxes';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HANDLE_ENV_INTENSITY, HANDLE_LOOK, cadEnvironment, cavityLook, economyLook, type HandleLook } from './cadLook';
import InstancedBoxes from './InstancedBoxes';
import { buildHandleGeometry, type HandleGeometry } from './handleGeometry';

/**
 * РУЧКИ В СЦЕНЕ (HANDLE-REAL).
 *
 * Сетку собирает `buildHandleGeometry` (тот же, что у картинок модулей):
 * в метрах и С ЦЕНТРОМ В ЦЕНТРЕ ГАБАРИТА — экземпляр встаёт на место
 * коробки ручки (`PartBox.position`) без растяжения, как рельеф фасада.
 * Одинаковых ручек в ряду много, и сетка у них одна: кэш по
 * модели, повороту, толщине фасада и подробности, с учётом, кто её держит.
 * Отпустил последний — буфер освобождается.
 *
 * Держат её пачка закрытых ручек (`HandleBatch`) и едущая деталь
 * (`HandleMesh`): у открытой двери та же ручка, что у закрытой.
 */

type Entry = HandleGeometry & { users: number };
const cache = new Map<string, Entry>();

export function handleGeometryKey(draw: HandleDraw, fine: boolean): string {
  return `${draw.model.key}|${draw.orient}|${draw.frontMm}|${fine ? 'f' : 'c'}`;
}

function build(draw: HandleDraw, fine: boolean): Entry {
  return { ...buildHandleGeometry(draw, fine), users: 0 };
}

function peek(draw: HandleDraw, fine: boolean): Entry {
  const key = handleGeometryKey(draw, fine);
  let entry = cache.get(key);
  if (!entry) {
    entry = build(draw, fine);
    cache.set(key, entry);
  }
  return entry;
}

function release(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  entry.users -= 1;
  if (entry.users <= 0) {
    entry.body.dispose();
    entry.accent?.dispose();
    cache.delete(key);
  }
}

/** Сколько сеток ручек держит сцена — приёмка сверяет, что смена ручки их не копит. */
export function handleGeometryCount(): number {
  return cache.size;
}

/**
 * Сетка ручки для меша или пачки: сразу, в отрисовке; учёт держащих — в
 * эффекте, парой «взял — отпустил».
 */
export function useHandleGeometry(draw: HandleDraw | undefined, fine: boolean): Entry | null {
  const key = draw ? handleGeometryKey(draw, fine) : null;
  const entry = useMemo(
    () => (draw ? peek(draw, fine) : null),
    // Ключ — модель, поворот, толщина и подробность: объект ручки пересоздаётся чаще.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  useEffect(() => {
    if (!key || !entry) return;
    /* Двойной эффект строгого режима отпустил сетку раньше: держим ту, которую рисуем. */
    if (!cache.has(key)) cache.set(key, entry);
    cache.get(key)!.users += 1;
    return () => release(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return entry;
}

/* ─────────────────────────  материалы  ───────────────────────── */

/*
 * Материал покрытия — один на отрисовщик и покрытие: окружение (PMREM) живёт в
 * своём контексте WebGL, и материал с картой чужого контекста не нарисовать.
 * Материалы живут, пока жив отрисовщик: покрытий в каталоге десяток.
 */
const materials = new WeakMap<THREE.WebGLRenderer, Map<string, THREE.MeshStandardMaterial>>();

function lookOf(finish: string, part: 'body' | 'rubber' | 'cavity'): HandleLook {
  const base = HANDLE_LOOK[finish] ?? HANDLE_LOOK.demo;
  if (part === 'rubber') return HANDLE_LOOK.rubber;
  if (part === 'cavity') return cavityLook(base);
  return base;
}

export function handleMaterial(
  gl: THREE.WebGLRenderer,
  finish: string,
  part: 'body' | 'rubber' | 'cavity',
  economy: boolean,
): THREE.MeshStandardMaterial {
  let own = materials.get(gl);
  if (!own) {
    own = new Map();
    materials.set(gl, own);
  }
  const key = `${finish}|${part}|${economy ? 'e' : 'n'}`;
  const ready = own.get(key);
  if (ready) return ready;
  const look = economy ? economyLook(lookOf(finish, part)) : lookOf(finish, part);
  const material = new THREE.MeshStandardMaterial({ color: look.color, metalness: look.metalness, roughness: look.roughness });
  if (!economy && look.metalness > 0) {
    material.envMap = cadEnvironment(gl);
    material.envMapIntensity = HANDLE_ENV_INTENSITY;
  }
  material.name = `handle:${finish}:${part}`;
  material.userData = { handleFinish: finish, part };
  own.set(key, material);
  return material;
}

/** Материалы ручки этого покрытия; отражения повёрнуты так же, как окружение сцены. */
export function useHandleMaterials(finish: string, accentKind: 'rubber' | 'cavity' | null) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const economy = useInteriorStore((state) => state.economyMode);
  const body = useMemo(() => handleMaterial(gl, finish, 'body', economy), [gl, finish, economy]);
  const accent = useMemo(
    () => (accentKind ? handleMaterial(gl, finish, accentKind, economy) : null),
    [gl, finish, accentKind, economy],
  );
  /* Своя карта окружения поворачивается вместе с окружением сцены (оно смотрит к открытой стороне). */
  useFrame(() => {
    for (const material of [body, accent]) {
      if (material?.envMap && material.envMapRotation.y !== scene.environmentRotation.y) {
        material.envMapRotation.copy(scene.environmentRotation);
      }
    }
  });
  return { body, accent };
}

/* ─────────────────────────  пачка и меш  ───────────────────────── */

/** Сводка ручки для приёмки: что нарисовано на какой детали. */
function summaryOf(box: BoxDraw & { part?: string; handle?: HandleDraw }) {
  const h = box.handle!;
  return {
    part: box.part ?? null,
    leaf: h.leaf,
    itemId: h.itemId,
    key: h.model.key,
    shape: h.model.shape,
    status: h.model.status,
    finish: h.model.finish,
    orient: h.orient,
    fits: h.fits,
    position: box.position,
    scale: box.scale,
  };
}

/**
 * ЗАКРЫТЫЕ РУЧКИ ОДНОЙ МОДЕЛИ И ОДНОГО ПОКРЫТИЯ — ОДИН ВЫЗОВ ОТРИСОВКИ.
 *
 * Имя пачки — `metal`, как у прежних брусков: счётчик металла на фасадах
 * (`__mwCadMetal`) считает ручки так же, как считал. Кольца и дно — своя
 * пачка того же места (`handle-accent`), в металл они не входят.
 */
export function HandleBatch({
  boxes,
  fine,
  castShadow,
}: {
  boxes: (BoxDraw & { part?: string; handle?: HandleDraw })[];
  fine: boolean;
  castShadow?: boolean;
}) {
  const draw = boxes[0]?.handle;
  const geometry = useHandleGeometry(draw, fine);
  const { body, accent } = useHandleMaterials(draw?.model.finish ?? 'demo', geometry?.accent ? (draw?.model.shape === 'flush' ? 'cavity' : 'rubber') : null);
  const extra = useMemo(() => ({ handles: boxes.map(summaryOf) }), [boxes]);
  if (!draw || !geometry) return null;
  return (
    <>
      <InstancedBoxes name="metal" boxes={boxes} geometry={geometry.body} placed material={body} castShadow={castShadow} userData={extra} />
      {geometry.accent && accent && (
        <InstancedBoxes name="handle-accent" boxes={boxes} geometry={geometry.accent} placed material={accent} />
      )}
    </>
  );
}

/**
 * РУЧКА НА ЕДУЩЕЙ ДЕТАЛИ — та же сетка, что в пачке, на месте её коробки.
 * `position` — центр коробки в кадре детали; `yaw` — поворот вместе с полотном.
 */
export function HandleMesh({
  draw,
  position,
  yaw = 0,
  fine,
  name = 'rider:handle',
  part,
}: {
  draw: HandleDraw;
  position: [number, number, number];
  yaw?: number;
  fine: boolean;
  name?: string;
  /** Деталь, с которой едет ручка (`<модуль>:door:1`): по ней приёмка находит её на ходу. */
  part?: string;
}) {
  const geometry = useHandleGeometry(draw, fine);
  const { body, accent } = useHandleMaterials(draw.model.finish, geometry?.accent ? (draw.model.shape === 'flush' ? 'cavity' : 'rubber') : null);
  if (!geometry) return null;
  return (
    <group
      position={position}
      rotation={[0, yaw, 0]}
      name={name}
      userData={{ handle: draw.leaf, key: draw.model.key, itemId: draw.itemId, fits: draw.fits, part: part ?? null }}
    >
      <mesh geometry={geometry.body} material={body} castShadow />
      {geometry.accent && accent && <mesh geometry={geometry.accent} material={accent} />}
    </group>
  );
}
