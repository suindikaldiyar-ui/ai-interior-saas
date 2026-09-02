'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { milledNormalMap } from './milledNormal';
import { loadTexture } from '@/lib/textureCache';
import type { SurfaceLook } from '@/lib/millwork/surfaces';

/**
 * ОБЩИЕ ГЕОМЕТРИЯ И МАТЕРИАЛЫ.
 *
 * Ряд 3200 мм — это семь модулей, около шестидесяти мешей плюс ящики.
 * Каждая полка со своей `BoxGeometry` и своим материалом превратила бы
 * сцену в сотню объектов: планшет замерщика этого не заслужил.
 *
 * Поэтому геометрия одна — единичный куб, который масштабируется, — а
 * материалов на всю сцену пять: корпус, фасад, столешница, техника, металл.
 */

export type CabinetParts = {
  box: THREE.BoxGeometry;
  cylinder: THREE.CylinderGeometry;
  carcass: THREE.MeshStandardMaterial;
  front: THREE.MeshStandardMaterial;
  counter: THREE.MeshStandardMaterial;
  /** Цоколь: тот же материал, что корпус, но темнее на 15%. */
  plinth: THREE.MeshStandardMaterial;
  appliance: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  /** Стекло витрины: прозрачное, но с бликом — иначе его не видно вовсе. */
  glass: THREE.MeshStandardMaterial;
  /** Светящаяся полоса подсветки. Гаснет перед захватом кадра. */
  glow: THREE.MeshBasicMaterial;
  /** Невидимый материал зон касания. */
  hit: THREE.MeshBasicMaterial;
};

/** Тот же цвет, но темнее: цоколь и тени в нишах. */
function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.multiplyScalar(1 - amount);
  return `#${color.getHexString()}`;
}

export type CabinetPalette = {
  facade: string;
  carcass: string;
  counter: string;
};

/**
 * МАТЕРИАЛЫ СОЗДАЮТСЯ ОДИН РАЗ И ДАЛЬШЕ ТОЛЬКО МЕНЯЮТСЯ.
 *
 * Клиент на встрече перебирает фасады подряд: белый, дуб, графит. Новый
 * материал на каждое нажатие — это перекомпиляция шейдера и заметная
 * задержка на планшете, а старые материалы ещё и остаются в памяти.
 * Поэтому цвет, шероховатость и текстура присваиваются существующим
 * материалам, а сами материалы живут, пока живёт сцена.
 */
export function useCabinetParts(
  palette: CabinetPalette,
  looks?: { facade?: SurfaceLook; counter?: SurfaceLook },
): CabinetParts {
  const parts = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);

    return {
      box,
      cylinder,
      /*
       * 3D показывает КОНСТРУКЦИЮ, а не материалы: текстуры дерева и мрамора
       * здесь не нужны, их показывает рендер. Поэтому все поверхности
       * матовые и нейтральные, а читается мебель формой и тенями.
       */
      carcass: new THREE.MeshStandardMaterial({
        color: darken(palette.carcass, 0.08),
        roughness: 0.72,
        metalness: 0,
      }),
      front: new THREE.MeshStandardMaterial({
        color: palette.facade,
        roughness: 0.72,
        metalness: 0,
      }),
      counter: new THREE.MeshStandardMaterial({
        color: palette.counter,
        roughness: 0.28,
        metalness: 0.04,
      }),
      plinth: new THREE.MeshStandardMaterial({
        color: darken(palette.carcass, 0.15),
        roughness: 0.8,
        metalness: 0,
      }),
      appliance: new THREE.MeshStandardMaterial({
        color: '#2A2C2E',
        roughness: 0.34,
        metalness: 0.5,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: '#9AA0A6',
        roughness: 0.35,
        metalness: 0.85,
      }),
      /*
       * Витрина: сквозь стекло видно полки, иначе это просто ещё один
       * шкаф. Прозрачность 0.18 — стекло читается бликом, а не пеленой.
       */
      glass: new THREE.MeshStandardMaterial({
        color: '#DFE6E8',
        roughness: 0.06,
        metalness: 0.1,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
      glow: new THREE.MeshBasicMaterial({ color: '#F6E2B8' }),
      // Зоны касания невидимы, но должны ловить луч: `visible: false` его
      // не пропускает, поэтому материал прозрачный, а не выключенный.
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    };
    // Материалы не пересобираются НИКОГДА: цвет и текстура меняются
    // присвоением ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Цвета: присвоение, а не новый материал ── */
  useEffect(() => {
    parts.carcass.color.set(darken(palette.carcass, 0.08));
    parts.plinth.color.set(darken(palette.carcass, 0.15));
  }, [parts, palette.carcass]);

  useSurfaceLook(parts.front, looks?.facade, {
    color: palette.facade,
    roughness: 0.72,
    metalness: 0,
  });

  useSurfaceLook(parts.counter, looks?.counter, {
    color: palette.counter,
    roughness: 0.28,
    metalness: 0.04,
  });

  return parts;
}

/**
 * Вид одной поверхности на существующем материале.
 *
 * Цвет и шероховатость применяются СРАЗУ — они ничего не грузят. Текстура
 * артикула приезжает из Storage через кэш и встаёт, когда придёт: до этого
 * поверхность уже своего цвета, а не серая заглушка.
 */
export function useSurfaceLook(
  material: THREE.MeshStandardMaterial,
  look: SurfaceLook | undefined,
  fallback: { color: string; roughness: number; metalness: number },
): void {
  const color = look?.color ?? fallback.color;
  const roughness = look?.roughness ?? fallback.roughness;
  const metalness = look?.metalness ?? fallback.metalness;
  const textureUrl = look?.textureUrl ?? null;
  const milled = Boolean(look?.milled);
  const repeatX = look?.repeat[0] ?? 1;
  const repeatY = look?.repeat[1] ?? 1;

  useEffect(() => {
    material.color.set(color);
    material.roughness = roughness;
    material.metalness = metalness;
  }, [material, color, roughness, metalness]);

  /* ── Фрезеровка: рельеф, а не цвет ── */
  useEffect(() => {
    const normal = milled ? milledNormalMap() : null;
    if (material.normalMap === normal) return;
    material.normalMap = normal;
    // Смена карты — это другой шейдер, здесь пересборка обязательна.
    material.needsUpdate = true;
  }, [material, milled]);

  /* ── Текстура артикула ── */
  useEffect(() => {
    let cancelled = false;

    if (!textureUrl) {
      if (material.map) {
        material.map = null;
        material.needsUpdate = true;
      }
      return;
    }

    loadTexture(textureUrl)
      .then((texture) => {
        if (cancelled) return;
        /*
         * Текстура одна на URL и лежит в кэше, поэтому повторы ставим на
         * клоне: две поверхности с разным числом повторов не должны
         * драться за одну и ту же картинку.
         */
        const own = texture.clone();
        own.needsUpdate = true;
        own.wrapS = THREE.RepeatWrapping;
        own.wrapT = THREE.RepeatWrapping;
        own.repeat.set(repeatX, repeatY);
        material.map = own;
        material.needsUpdate = true;
      })
      .catch(() => {
        // Файл не отдался — остаётся цвет. Пустая поверхность хуже цвета.
      });

    return () => {
      cancelled = true;
    };
  }, [material, textureUrl, repeatX, repeatY]);
}
