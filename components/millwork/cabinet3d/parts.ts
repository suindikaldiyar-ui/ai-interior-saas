'use client';

import { CARCASS_ROUGHNESS, INNER_ROUGHNESS, applyFrontLook } from './cadLook';
import { setRealSizeMap, unpatch } from './realSizeMap';
import { MATERIAL_FINISHES } from '@/lib/millwork/materialFinishes';
import type { MaterialPhoto } from '@/lib/millwork/materialCollection';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { milledNormalMap, millingReliefMap } from './milledNormal';
import type { MillingItem } from '@/lib/millwork/milling';
import { RELIEF_NORMAL_SCALE } from '@/lib/millwork/relief';
import { loadTexture } from '@/lib/textureCache';
import type { SurfaceLook } from '@/lib/millwork/surfaces';
import { DEFAULT_FRONT, frontKey } from '@/lib/millwork/frontMaterial';
/*
 * Цвет по роли — одна таблица на продукт: сцена её ЧИТАЕТ. Свои
 * `darken`/`lighten` здесь означали бы вторую палитру, и проверка
 * мерила бы не то, что на экране.
 */
import { darkenHex, lightenHex, plinthColor, roleColors } from '@/lib/millwork/sceneColors';
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
  /** Внутренности: полки, перегородки, короба ящиков, задняя стенка. */
  inner: THREE.MeshStandardMaterial;
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
        color: roleColors(palette).carcass,
        roughness: CARCASS_ROUGHNESS,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      /*
       * ВНУТРЕННОСТИ СВЕТЛЕЕ КОРПУСА — на два шага, а не на оттенок:
       * при повороте на 45° разница в один процент не читается вовсе.
       */
      inner: new THREE.MeshStandardMaterial({
        color: roleColors(palette).inner,
        roughness: INNER_ROUGHNESS,
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
      /*
       * Столешница — физический материал: у поверхностей каталога есть
       * лак (слой 51). Без лака он рисует как стандартный.
       */
      counter: new THREE.MeshPhysicalMaterial({
        color: palette.counter,
        roughness: 0.28,
        metalness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      plinth: new THREE.MeshStandardMaterial({
        color: plinthColor(palette),
        roughness: 0.8,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      appliance: new THREE.MeshStandardMaterial({
        color: roleColors(palette).appliance,
        roughness: 0.34,
        metalness: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: roleColors(palette).metal,
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
    parts.carcass.color.set(roleColors(palette).carcass);
    parts.inner.color.set(roleColors(palette).inner);
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
  const invalidate = useThree((state) => state.invalidate);
  const color = look?.color ?? fallback.color;
  const roughness = look?.roughness ?? fallback.roughness;
  const metalness = look?.metalness ?? fallback.metalness;
  const textureUrl = look?.textureUrl ?? null;
  const milled = Boolean(look?.milled);
  const repeatX = look?.repeat[0] ?? 1;
  const repeatY = look?.repeat[1] ?? 1;
  /*
   * НАСТОЯЩИЙ РАЗМЕР ФОТО (слой 51). У позиции каталога материалов фото
   * ложится по метрам грани, а не повторами на «габарит поверхности»:
   * у столешницы плит несколько, и повторы на длину ряда растягивали бы
   * рисунок по каждой.
   */
  const realW = look?.realSizeM?.[0] ?? 0;
  const realH = look?.realSizeM?.[1] ?? 0;

  const clearcoat = look?.clearcoat ?? 0;
  const clearcoatRoughness = look?.clearcoatRoughness ?? 0;

  useEffect(() => {
    material.color.set(color);
    material.roughness = roughness;
    material.metalness = metalness;
    /* Лак есть только у физического материала: столешница из каталога — он. */
    if (material instanceof THREE.MeshPhysicalMaterial) {
      material.clearcoat = clearcoat;
      material.clearcoatRoughness = clearcoatRoughness;
    }
    invalidate();
  }, [material, color, roughness, metalness, clearcoat, clearcoatRoughness, invalidate]);

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
      setRealSizeMap(material, null, null);
      return;
    }

    loadTexture(textureUrl)
      .then((texture) => {
        if (cancelled) return;
        if (realW > 0 && realH > 0) {
          setRealSizeMap(material, texture, [realW, realH]);
        } else {
          unpatch(material);
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
        }
        // `frameloop="demand"`: без кадра текстура встанет в памяти, но не на экране.
        invalidate();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        /*
         * Файл не отдался — остаётся цвет: пустая поверхность хуже цвета.
         * Но не молча: адрес лежит на материале, и приёмка его видит.
         */
        material.userData.textureFailed = textureUrl;
        console.error(`Текстура не загрузилась: ${textureUrl}`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [material, textureUrl, repeatX, repeatY, realW, realH, invalidate]);
}


/* ────────────────  Материал фасада виден сразу  ──────────────── */

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
  /**
   * ФРЕЗЕРОВКИ ОРГАНИЗАЦИИ — ТОТ ЖЕ КАТАЛОГ, ЧТО У КАРТОЧЕК.
   *
   * Сцена не держит своего списка профилей: карточка и фасад обязаны
   * показывать один и тот же контур. Пусто — рельефа не будет, и это
   * честнее выдуманного: профиль знает только каталог.
   */
  milling: Map<string, MillingItem> = new Map(),
  /**
   * ФОТО ПОЗИЦИЙ КАТАЛОГА МАТЕРИАЛОВ — по идентификатору позиции.
   *
   * Фото ложится в настоящем размере (`setRealSizeMap`), а не по детали.
   * Позиции без фото красятся цветом, как и раньше.
   */
  photos: Map<string, MaterialPhoto> = new Map(),
): Map<string, THREE.MeshPhysicalMaterial> {
  const invalidate = useThree((state) => state.invalidate);
  const cache = useMemo(() => new Map<string, THREE.MeshPhysicalMaterial>(), []);

  /*
   * ФИЗИЧЕСКИЙ МАТЕРИАЛ, А НЕ СТАНДАРТНЫЙ: у поверхностей каталога есть
   * ЛАК (`clearcoat`) — High Gloss это лак 1.0 поверх плиты. У
   * стандартного материала лака нет вовсе, и глянец читался бы тем же
   * пятном, что мат. Без лака физический рисует как стандартный.
   */
  const materials = useMemo(() => {
    const out = new Map<string, THREE.MeshPhysicalMaterial>();
    for (const key of Array.from(specs.keys())) {
      let material = cache.get(key);
      if (!material) {
        material = new THREE.MeshPhysicalMaterial();
        cache.set(key, material);
      }
      out.set(key, material);
    }
    return out;
  }, [specs, cache]);

  useEffect(() => {
    let cancelled = false;

    for (const [key, spec] of Array.from(specs.entries())) {
      const material = materials.get(key);
      if (!material) continue;
      /* Вид фасада — одна функция на сцену, картинки и приёмку (`cadLook`). */
      applyFrontLook(material, spec, fallbackColor, MATERIAL_FINISHES);

      /*
       * ФРЕЗЕРОВАННЫЙ ФАСАД ВИДЕН РЕЛЬЕФОМ, А НЕ ЦВЕТОМ.
       *
       * Профиль — это углубление в плоскости, и на плоском цвете его не
       * показать: клиент не отличит Модерн от ровного фасада, а платит за
       * разное. Карта нормалей рисуется на канвасе прямо здесь
       * (`milledNormal.ts`) — файл пришлось бы тянуть из сети, а сцена
       * обязана работать в квартире без интернета.
       *
       * Пачки уже разделены: `frontKey` включает фрезеровку, поэтому
       * фасад с Модерном и без него — два разных материала, а не один.
       */
      const item = spec.millingId ? milling.get(spec.millingId) : undefined;
      const normal = item
        ? millingReliefMap(item.id, item.milling.layers ?? [], item.milling.profile)
        : null;
      if (material.normalMap !== normal) {
        material.normalMap = normal;
        // Смена карты — это другой шейдер, пересборка обязательна.
        material.needsUpdate = true;
      }
      /*
       * ГЛУБИНА РЕЛЬЕФА НА МЕБЕЛИ.
       *
       * Карта нормалей шла с силой 1.0, и на общем виде профиль пропадал:
       * фасад читался гладким, хотя клиент за фрезеровку платит. 1.6 —
       * столько, чтобы «Ампир» был виден с общего вида и не превращался
       * вблизи в штамповку.
       */
      material.normalScale.set(RELIEF_NORMAL_SCALE, RELIEF_NORMAL_SCALE);

      /*
       * ФОТО ПОЗИЦИИ — ПОСЛЕ ЦВЕТА, А НЕ ВМЕСТО НЕГО.
       *
       * Пока фото едет, фасад уже цвета позиции; приехало — цвет белый, и
       * рисунок несёт текстура. Не приехало — остаётся цвет, а адрес
       * лежит на материале: молча потерянное фото выглядело бы «так и
       * задумано».
       */
      const photo = spec.itemId ? photos.get(spec.itemId) : undefined;
      if (!photo) {
        setRealSizeMap(material, null, null);
        continue;
      }
      loadTexture(photo.url)
        .then((texture) => {
          if (cancelled) return;
          applyFrontLook(material, spec, fallbackColor, MATERIAL_FINISHES, true);
          setRealSizeMap(material, texture, photo.sizeM);
          invalidate();
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          material.userData.textureFailed = photo.url;
          console.error(`Фото позиции не загрузилось: ${photo.url}`, error);
        });
    }
    /*
     * `frameloop="demand"`: без явного кадра рельеф сменится в памяти, а
     * на экране останется прежний фасад (ловушка 250).
     */
    invalidate();

    return () => {
      cancelled = true;
    };
  }, [specs, materials, fallbackColor, milling, photos, invalidate]);

  useEffect(
    () => () => {
      for (const material of Array.from(cache.values())) material.dispose();
    },
    [cache],
  );

  return materials;
}

/**
 * МАТЕРИАЛЫ КОРПУСА ПО КЛЮЧАМ.
 *
 * Внутри шкафа своя плита, и у неё свой декор: белый корпус под цветной
 * фасад — самый частый заказ. Устроено как у фасадов: материал под
 * ключом создаётся ОДИН раз и дальше только меняет цвет — пересоздание
 * это перекомпиляция шейдера ровно в тот момент, когда клиент перебирает
 * декоры (ловушка 248).
 *
 * `frameloop="demand"`: после смены цвета кадр запрашивается явно, иначе
 * материал сменится в памяти, а на экране останется прежний (ловушка 250).
 */
export function useCarcassMaterials(
  keys: Map<string, string>,
  inner: boolean,
  /** Фото декора по тому же ключу пачки: ложится в настоящем размере. */
  photos: Map<string, MaterialPhoto> = new Map(),
): Map<string, THREE.MeshStandardMaterial> {
  const invalidate = useThree((state) => state.invalidate);
  const cache = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), []);

  const materials = useMemo(() => {
    const out = new Map<string, THREE.MeshStandardMaterial>();
    for (const key of Array.from(keys.keys())) {
      let material = cache.get(key);
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          roughness: 0.72,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        cache.set(key, material);
      }
      out.set(key, material);
    }
    return out;
  }, [keys, cache]);

  useEffect(() => {
    let cancelled = false;

    for (const [key, hex] of Array.from(keys.entries())) {
      const material = materials.get(key);
      if (!material) continue;
      /* Внутренности светлее корпуса — та же таблица ролей, что и без декора. */
      material.color.set(inner ? lightenHex(hex, 0.18) : darkenHex(hex, 0.08));

      const photo = photos.get(key);
      if (!photo) {
        setRealSizeMap(material, null, null);
        continue;
      }
      loadTexture(photo.url)
        .then((texture) => {
          if (cancelled) return;
          // Под фото цвет белый: рисунок несёт текстура (как у фасада).
          material.color.set('#ffffff');
          setRealSizeMap(material, texture, photo.sizeM);
          invalidate();
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          material.userData.textureFailed = photo.url;
          console.error(`Фото декора корпуса не загрузилось: ${photo.url}`, error);
        });
    }
    invalidate();

    return () => {
      cancelled = true;
    };
  }, [keys, materials, inner, photos, invalidate]);

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
