'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GlassKind } from '@/types/millwork';
import { GLASS_KINDS } from '@/lib/millwork/glass';

/**
 * КАК ВЫГЛЯДИТ СТЕКЛО (V3D-02) — ОДНО МЕСТО НА ПАЧКУ РЯДА И ЕДУЩУЮ ДВЕРЬ.
 *
 * Вид стекла лежит на модуле (`Module.glass`); здесь только его картинка.
 * Материалов два набора, и оба создаются ОДИН раз на сцену:
 *
 *   САПР-вид   плоско и полупрозрачно (ловушка 299: не фотореализм) — но вид
 *              различим: бронза тёплая, серое темнее, матовое молочное,
 *              зеркало непрозрачное;
 *   «Интерьер» физический материал: отражения окружения, Френель, у матового
 *              и рифлёного — пропускание с размытием (`transmission`), у
 *              рифлёного — рельеф карты нормалей.
 *
 * ПРОЗРАЧНОЕ ЗА ПРОЗРАЧНЫМ. Пропускание three собирает из НЕПРОЗРАЧНОЙ сцены:
 * стеклянная полка за пропускающей дверью пропала бы. Поэтому прозрачное,
 * бронзовое и серое — обычная прозрачность (полки за ними видны, порядок —
 * `renderOrder`: полки раньше дверей), пропускание — только у матового и
 * рифлёного, за которыми мелкое и так не читается; за ними видно
 * непрозрачное (стенки, полки ЛДСП, свечение ленты), стеклянные полки — нет,
 * и это сказано в отчёте слоя.
 *
 * Зеркало отражает ОКРУЖЕНИЕ сцены, а не комнату: отражения комнаты в
 * реальном времени (вторая камера) здесь нет.
 */

type GlassSpec = {
  color: string;
  opacity: number;
  roughness: number;
  metalness: number;
  transmission?: number;
  envMapIntensity?: number;
  /** Рисунок рифления: карта нормалей. */
  fluted?: boolean;
};

/** САПР-вид: прозрачное — прежнее стекло сцены, остальные различимы цветом и плотностью. */
const CAD_GLASS: Record<GlassKind, GlassSpec> = {
  clear: { color: '#DFE6E8', opacity: 0.18, roughness: 0.06, metalness: 0.1 },
  /* Осветлённое (P1): без зелени торца — светлее и прозрачнее прозрачного. */
  extra_clear: { color: '#F2F6F7', opacity: 0.12, roughness: 0.05, metalness: 0.1 },
  frosted: { color: '#EEF1F2', opacity: 0.66, roughness: 0.7, metalness: 0 },
  bronze: { color: '#8C6A45', opacity: 0.46, roughness: 0.08, metalness: 0.1 },
  grey: { color: '#5B6064', opacity: 0.5, roughness: 0.08, metalness: 0.1 },
  fluted: { color: '#E1E8EA', opacity: 0.42, roughness: 0.3, metalness: 0.05, fluted: true },
  mirror: { color: '#C9CED1', opacity: 1, roughness: 0.05, metalness: 1 },
};

/** «Интерьер»: физическое стекло. Числа — условные (VISUAL_ONLY), подобраны по виду на демо. */
const DESIGN_GLASS: Record<GlassKind, GlassSpec> = {
  clear: { color: '#EEF5F2', opacity: 0.16, roughness: 0.02, metalness: 0, envMapIntensity: 1.6 },
  extra_clear: { color: '#FAFCFC', opacity: 0.1, roughness: 0.02, metalness: 0, envMapIntensity: 1.6 },
  frosted: { color: '#F6F8F8', opacity: 1, roughness: 0.5, metalness: 0, transmission: 1, envMapIntensity: 1 },
  bronze: { color: '#7E5732', opacity: 0.55, roughness: 0.03, metalness: 0, envMapIntensity: 1.6 },
  grey: { color: '#454A4E', opacity: 0.6, roughness: 0.03, metalness: 0, envMapIntensity: 1.6 },
  fluted: { color: '#FFFFFF', opacity: 1, roughness: 0.12, metalness: 0, transmission: 1, envMapIntensity: 1.2, fluted: true },
  mirror: { color: '#DDE1E4', opacity: 1, roughness: 0.03, metalness: 1, envMapIntensity: 1.4 },
};

/** Стеклянная полка: обычная прозрачность — за прозрачной дверью она видна. */
const SHELF_GLASS: Record<'cad' | 'design', GlassSpec> = {
  cad: { color: '#D3E2DE', opacity: 0.3, roughness: 0.06, metalness: 0.05 },
  design: { color: '#DCEBE6', opacity: 0.28, roughness: 0.02, metalness: 0, envMapIntensity: 1.6 },
};

/** Сколько рифлей на ширину стекла: рисунок условный — шаг около 15 мм на двери 400 мм. */
export const FLUTE_REPEAT = 24;

let fluteMap: THREE.DataTexture | null = null;

/**
 * КАРТА НОРМАЛЕЙ РИФЛЕНИЯ — полукруглые жилки поперёк ширины. Одна на вкладку
 * (как градиент затенения в `cadLook`): данные, а не файл, — без сети.
 */
export function fluteNormalMap(): THREE.DataTexture {
  if (fluteMap) return fluteMap;
  const width = 64;
  const height = 4;
  const data = new Uint8Array(width * height * 4);
  for (let x = 0; x < width; x += 1) {
    const u = (x + 0.5) / width;
    const t = 2 * u - 1;
    // Наклон полукруглого профиля: dh/du, зажатый у краёв жилки.
    const slope = Math.max(-2.5, Math.min(2.5, -t / Math.sqrt(Math.max(0.04, 1 - t * t))));
    const n = new THREE.Vector3(-slope * 0.45, 0, 1).normalize();
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((n.x * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLUTE_REPEAT, 1);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  fluteMap = texture;
  return texture;
}

function makeGlass(spec: GlassSpec, physical: boolean, kind: string): THREE.MeshStandardMaterial {
  const material = physical
    ? new THREE.MeshPhysicalMaterial({
        color: spec.color,
        roughness: spec.roughness,
        metalness: spec.metalness,
        transmission: spec.transmission ?? 0,
        thickness: spec.transmission ? 0.004 : 0,
        ior: 1.5,
        specularIntensity: 1,
      })
    : new THREE.MeshStandardMaterial({ color: spec.color, roughness: spec.roughness, metalness: spec.metalness });
  const blended = !spec.transmission && spec.opacity < 1;
  material.transparent = blended;
  material.opacity = spec.opacity;
  /* Прозрачное не пишет глубину: полка за дверью и дверь друг друга не режут. */
  material.depthWrite = !blended;
  if (spec.envMapIntensity !== undefined) material.envMapIntensity = spec.envMapIntensity;
  if (spec.fluted) {
    material.normalMap = fluteNormalMap();
    material.normalScale.set(1, 1);
  }
  material.name = `glass:${kind}`;
  /* Признак для рендера по чертежу и приёмки: это стекло, а не мебель. */
  material.userData.glass = kind;
  return material;
}

export type GlassMaterials = {
  door: Record<GlassKind, THREE.MeshStandardMaterial>;
  shelf: THREE.MeshStandardMaterial;
};

/**
 * МАТЕРИАЛЫ СТЕКЛА ПАЧКИ: оба набора создаются при первом показе и живут со
 * сценой. Переключение «САПР ↔ Интерьер» меняет ССЫЛКУ на материал у пачки, а
 * не создаёт его заново — геометрия и экземпляры прежние.
 */
export function useGlassMaterials(design: boolean): GlassMaterials {
  const cad = useMemo<GlassMaterials>(
    () => ({
      door: Object.fromEntries(GLASS_KINDS.map((kind) => [kind, makeGlass(CAD_GLASS[kind], false, kind)])) as Record<
        GlassKind,
        THREE.MeshStandardMaterial
      >,
      shelf: makeGlass(SHELF_GLASS.cad, false, 'shelf'),
    }),
    [],
  );
  /*
   * Набор «Интерьера» — при первом входе в режим и до конца жизни сцены:
   * выход и повторный вход не собирают программы стекла заново.
   */
  const physical = useRef<GlassMaterials | null>(null);
  if (design && !physical.current) {
    physical.current = {
      door: Object.fromEntries(GLASS_KINDS.map((kind) => [kind, makeGlass(DESIGN_GLASS[kind], true, kind)])) as Record<
        GlassKind,
        THREE.MeshStandardMaterial
      >,
      shelf: makeGlass(SHELF_GLASS.design, true, 'shelf'),
    };
  }
  useEffect(
    () => () => {
      for (const material of [...Object.values(cad.door), cad.shelf]) material.dispose();
      const own = physical.current;
      if (own) for (const material of [...Object.values(own.door), own.shelf]) material.dispose();
    },
    [cad],
  );
  return design && physical.current ? physical.current : cad;
}
