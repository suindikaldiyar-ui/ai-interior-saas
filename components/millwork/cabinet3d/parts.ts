'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { milledNormalMap } from './milledNormal';
import { loadTexture } from '@/lib/textureCache';
import type { SurfaceLook } from '@/lib/millwork/surfaces';
import { DEFAULT_FRONT, frontKey } from '@/lib/millwork/frontMaterial';
import { frontSwatch } from '@/lib/millwork/frontSwatch';
import type { FrontSpec } from '@/types/millwork';
import { useThree } from '@react-three/fiber';

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
  /**
   * Режим «Каркас»: корпус просвечивает, видно полки и ящики насквозь.
   *
   * В режиме «Фасады» всё непрозрачно — сквозь мебель не должно быть
   * видно ни стены, ни соседнего модуля, иначе ряд читается проволокой,
   * а не мебелью.
   */
  frame = false,
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
      /*
       * СМЕЩЕНИЕ ГРАНЕЙ ПОД РЁБРА.
       *
       * Рёбра лежат ровно на плоскостях деталей, и без смещения половина
       * из них проваливается в грань, а половина проступает СКВОЗЬ
       * соседнюю: получается проволочная сетка поверх сплошной мебели.
       * `polygonOffset` отодвигает грань на доли пикселя вглубь — линия
       * рисуется по краю, а не спорит с ним.
       */
      carcass: new THREE.MeshStandardMaterial({
        color: darken(palette.carcass, 0.08),
        roughness: 0.72,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      front: new THREE.MeshStandardMaterial({
        color: palette.facade,
        roughness: 0.72,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      counter: new THREE.MeshStandardMaterial({
        color: palette.counter,
        roughness: 0.28,
        metalness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      plinth: new THREE.MeshStandardMaterial({
        color: darken(palette.carcass, 0.15),
        roughness: 0.8,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      appliance: new THREE.MeshStandardMaterial({
        color: '#2A2C2E',
        roughness: 0.34,
        metalness: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
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

  /*
   * РЕЖИМ МЕНЯЕТСЯ ПРИСВОЕНИЕМ.
   *
   * Новый материал на каждое переключение — это перекомпиляция шейдера
   * ровно в тот момент, когда клиент смотрит на экран (ловушка 184).
   * `needsUpdate` обязателен: прозрачность меняет саму программу.
   */
  useEffect(() => {
    for (const material of [parts.carcass, parts.plinth]) {
      material.transparent = frame;
      material.opacity = frame ? 0.38 : 1;
      material.depthWrite = !frame;
      material.needsUpdate = true;
    }
  }, [parts, frame]);

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


/* ────────────────  Материал фасада виден сразу  ──────────────── */

/**
 * ШЕРОХОВАТОСТЬ ПО ФАКТУРЕ.
 *
 * Разница обязана быть ЗАМЕТНОЙ, а не тонкой: клиент на встрече сравнивает
 * глянец с матом на планшете, при комнатном свете, за две секунды. 0.06
 * отражает окно почти зеркально, 0.78 не бликует вовсе — между ними видно
 * невооружённым глазом, в отличие от «0.4 против 0.5».
 */
const FRONT_ROUGHNESS: Record<FrontSpec['finish'], number> = {
  gloss: 0.06,
  matte: 0.78,
  textured: 0.62,
};

/**
 * Небольшая «металличность» глянца.
 *
 * Чистый диэлектрик с нулевой шероховатостью на схематичной сцене
 * выглядит просто светлым пятном: блик появляется, когда есть что
 * отражать. Это не физика краски, а способ показать разницу.
 */
const FRONT_METALNESS: Record<FrontSpec['finish'], number> = {
  gloss: 0.16,
  matte: 0,
  textured: 0.02,
};

/**
 * ЦВЕТ ФАСАДА — ОДНА ФОРМУЛА НА СЦЕНУ И НА СХЕМУ.
 *
 * Здесь стояла своя: «артикул выбран — его цвет, иначе цвет сцены». А
 * схема считала иначе — `frontSwatch`: «иначе типовой цвет ЭТОЙ БАЗЫ».
 * Расхождение видно сразу, как только человек берёт базу без артикула:
 * акрил на схеме тёмный, а в сцене бежевый, потому что запасной цвет
 * один на все базы.
 *
 * Восьмой случай того же класса — две формулы одной величины. Считает
 * `frontSwatch`, сцена только спрашивает.
 */
function frontColor(spec: FrontSpec, fallback: string): string {
  const color = frontSwatch(spec).color;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

/**
 * МАТЕРИАЛЫ ФАСАДОВ ПО КЛЮЧАМ.
 *
 * У каждого модуля свой фасад, но материалов ровно столько, сколько РАЗНЫХ
 * фасадов в ряду: модули с одинаковым материалом рисуются одной пачкой.
 * Материал под ключом создаётся ОДИН раз и дальше только меняется —
 * пересоздание это перекомпиляция шейдера и задержка ровно в тот момент,
 * когда клиент перебирает варианты.
 *
 * `frameloop="demand"`: сцена не перерисовывается сама. После присвоения
 * цвета и шероховатости кадр запрашивается явно, иначе материал сменится
 * в памяти, а на экране останется прежний.
 */
export function useFrontMaterials(
  specs: Map<string, FrontSpec>,
  fallbackColor: string,
): Map<string, THREE.MeshStandardMaterial> {
  const invalidate = useThree((state) => state.invalidate);
  const cache = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), []);

  const materials = useMemo(() => {
    const out = new Map<string, THREE.MeshStandardMaterial>();
    for (const [key, spec] of Array.from(specs.entries())) {
      let material = cache.get(key);
      if (!material) {
        material = new THREE.MeshStandardMaterial();
        cache.set(key, material);
      }
      out.set(key, material);
      void spec;
    }
    return out;
  }, [specs, cache]);

  useEffect(() => {
    for (const [key, spec] of Array.from(specs.entries())) {
      const material = materials.get(key);
      if (!material) continue;
      material.color.set(frontColor(spec, fallbackColor));
      material.roughness = FRONT_ROUGHNESS[spec.finish];
      material.metalness = FRONT_METALNESS[spec.finish];
    }
    invalidate();
  }, [specs, materials, fallbackColor, invalidate]);

  useEffect(
    () => () => {
      for (const material of Array.from(cache.values())) material.dispose();
    },
    [cache],
  );

  return materials;
}

/** Ключ фасада по умолчанию: им рисуется всё, у чего материал не задан. */
export const DEFAULT_FRONT_KEY = frontKey(DEFAULT_FRONT);
