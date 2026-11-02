'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { HardwareTwin, TwinFinish, TwinRole } from '@/types/catalog';
import { twinPlacement, twinRoleOf } from '@/lib/millwork/hardwareTwin';
import { CATALOG_BUCKET, storageUrl } from '@/lib/supabase/config';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HANDLE_ENV_INTENSITY, cadEnvironment } from './cadLook';
import { reportSceneAnomaly } from './sceneAnomalies';

/**
 * МОДЕЛЬ ИЗ РЕЕСТРА 3D В СЦЕНЕ (ТЗ 2026-10-31, § 3, 4, 20).
 *
 * Файл (GLB, мм, Y вверх) читается один раз на вкладку и держится в кэше по
 * пути: десяток одинаковых петель — одна загрузка и одна геометрия, у
 * экземпляров — клоны сцены с общими буферами. Части — по ролям записи
 * (`parts`): чашка едет с фасадом, плечо стоит на боковине. Место — одна
 * `twinPlacement`: монтажная точка модели на монтажную точку движка.
 *
 * Загрузчик GLTF — динамическим импортом в 3D-чанке: в первую загрузку
 * экрана он не едет. Файл не загрузился — аномалия разработчику
 * (`__mwSceneAnomalies`), в сцене ничего: процедурная модель за CAD не
 * выдаётся, а пустое место честнее подмены.
 */

type Loaded = { scene: THREE.Group } | { error: string };
const cache = new Map<string, Promise<Loaded>>();

function loadTwin(path: string): Promise<Loaded> {
  const known = cache.get(path);
  if (known) return known;
  const url = storageUrl(CATALOG_BUCKET, path);
  const promise = (async (): Promise<Loaded> => {
    try {
      if (!url) return { error: 'Storage не настроен' };
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(url);
      /* Правая петля — отражение по X: грани с обеих сторон, иначе отражённая модель вывернута наизнанку. */
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => (m.side = THREE.DoubleSide));
      });
      return { scene: gltf.scene };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  })();
  cache.set(path, promise);
  return promise;
}

/** Покрытие — материал металла и пластика; блеск — шероховатостью, без лака (ловушка 796). */
const FINISH: Record<TwinFinish, { color: string; metalness: number; roughness: number }> = {
  chrome: { color: '#d9dde2', metalness: 1, roughness: 0.12 },
  nickel: { color: '#c7c4bd', metalness: 1, roughness: 0.28 },
  stainless: { color: '#bfc3c7', metalness: 1, roughness: 0.38 },
  aluminium: { color: '#c9ccd0', metalness: 0.9, roughness: 0.42 },
  black_matte: { color: '#1f2023', metalness: 0.35, roughness: 0.7 },
  white: { color: '#eeeeea', metalness: 0, roughness: 0.55 },
  grey: { color: '#8b8f94', metalness: 0.2, roughness: 0.6 },
  brass: { color: '#b8954f', metalness: 1, roughness: 0.3 },
  anthracite: { color: '#3c3f44', metalness: 0.5, roughness: 0.55 },
};
/**
 * Материалы модели — НА ОТРИСОВЩИК, металл со СВОЕЙ картой окружения, как у ручек
 * и профиля витрины (ловушки 639, 724): на окружении сцены (сила 0,5) металл
 * покрытия «никель» и цинк файла рисовались тёмно-серыми, царга TANDEMBOX —
 * почти чёрной. Карта окружения живёт в контексте WebGL, поэтому и материал —
 * в контексте; экономичный режим — без отражений.
 */
const materials = new WeakMap<THREE.WebGLRenderer, Map<string, THREE.MeshStandardMaterial>>();
function ownMaterial(gl: THREE.WebGLRenderer, key: string, economy: boolean, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let own = materials.get(gl);
  if (!own) {
    own = new Map();
    materials.set(gl, own);
  }
  const full = `${key}|${economy ? 'e' : 'n'}`;
  const known = own.get(full);
  if (known) return known;
  const material = make();
  material.side = THREE.DoubleSide;
  if (!economy && material.metalness > 0) {
    material.envMap = cadEnvironment(gl);
    material.envMapIntensity = HANDLE_ENV_INTENSITY;
  }
  material.userData = { ...material.userData, twinMaterial: key };
  own.set(full, material);
  return material;
}
function finishMaterial(gl: THREE.WebGLRenderer, finish: TwinFinish, economy: boolean): THREE.MeshStandardMaterial {
  const f = FINISH[finish];
  return ownMaterial(gl, `finish:${finish}`, economy, () => new THREE.MeshStandardMaterial({ color: f.color, metalness: f.metalness, roughness: f.roughness, name: `twin:${finish}` }));
}
/** Материал из файла: металлический — копия на отрисовщик со своей картой окружения; прочий — как в файле. */
function fileMaterial(gl: THREE.WebGLRenderer, source: THREE.Material, economy: boolean): THREE.Material {
  const standard = source as THREE.MeshStandardMaterial;
  if (!standard.isMeshStandardMaterial || standard.metalness <= 0) return source;
  return ownMaterial(gl, `file:${source.uuid}`, economy, () => standard.clone());
}

function useTwinScene(twin: HardwareTwin): THREE.Group | null {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let alive = true;
    void loadTwin(twin.asset.path).then((loaded) => {
      if (!alive) return;
      if ('error' in loaded) {
        reportSceneAnomaly({ what: 'twin-load', where: `${twin.asset.path}: ${loaded.error}` });
        return;
      }
      setScene(loaded.scene);
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [twin.asset.path, invalidate]);
  return scene;
}

/** Часть модели одной роли — клон сцены файла без узлов чужой роли; геометрия общая с файлом. */
function rolePart(scene: THREE.Group, twin: HardwareTwin, role: TwinRole, gl: THREE.WebGLRenderer, economy: boolean): THREE.Group {
  const part = scene.clone(true);
  const material = twin.finish ? finishMaterial(gl, twin.finish, economy) : null;
  const foreign: THREE.Mesh[] = [];
  part.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    /* Роль — у ближайшего узла с именем из записи: вложенные части наследуют её. */
    let node: THREE.Object3D | null = mesh;
    let found: TwinRole | null = null;
    while (node && node !== part) {
      if (twin.parts.some((p) => p.node === node!.name)) {
        found = twinRoleOf(twin, node.name);
        break;
      }
      node = node.parent;
    }
    if ((found ?? 'fixed') !== role) {
      foreign.push(mesh);
      return;
    }
    mesh.material = material ?? (Array.isArray(mesh.material) ? mesh.material.map((m) => fileMaterial(gl, m, economy)) : fileMaterial(gl, mesh.material, economy));
    mesh.castShadow = true;
    /* Узел файла — для приёмки: какая часть изделия где стоит и куда едет. */
    mesh.userData.node = mesh.userData.node ?? mesh.name;
    mesh.name = `twin:${role}`;
  });
  for (const mesh of foreign) mesh.parent?.remove(mesh);
  return part;
}

/**
 * КЛЮЧ ЭКЗЕМПЛЯРА МОДЕЛИ НА ОБЪЕКТЕ: ящик (или «корпус» с местом у неподвижной
 * части), сторона, роль. Одинаков в общей пачке и в группе едущего ящика —
 * приёмка сравнивает ту же часть до и после хода.
 */
export function twinKeyOf(box: { part?: string; twin?: { anchorM: [number, number, number]; mirror: boolean; role: TwinRole } }): string {
  if (!box.twin) return '';
  const side = box.twin.mirror ? 'R' : 'L';
  return box.part ? `${box.part}|${side}|${box.twin.role}` : `cabinet|${box.twin.anchorM.map((v) => v.toFixed(4)).join(',')}|${side}|${box.twin.role}`;
}

/** Одна модель реестра в точке движка. */
export function TwinModel({
  twin,
  role,
  anchorM,
  mirror = false,
  name,
  twinKey,
}: {
  twin: HardwareTwin;
  role: TwinRole;
  anchorM: [number, number, number];
  mirror?: boolean;
  name?: string;
  /** Что это за экземпляр на объекте (ящик, сторона, роль) — одинаковый в пачке и на ходу; приёмке. */
  twinKey?: string;
}) {
  const scene = useTwinScene(twin);
  const gl = useThree((state) => state.gl);
  const world = useThree((state) => state.scene);
  const economy = useInteriorStore((state) => state.economyMode);
  const part = useMemo(() => (scene ? rolePart(scene, twin, role, gl, economy) : null), [scene, twin, role, gl, economy]);
  /* Своя карта окружения поворачивается вместе с окружением сцены (оно смотрит к открытой стороне). */
  useFrame(() => {
    part?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        if (m.envMap && m.envMapRotation.y !== world.environmentRotation.y) m.envMapRotation.copy(world.environmentRotation);
      }
    });
  });
  if (!part) return null;
  const place = twinPlacement(twin, anchorM, mirror);
  return <primitive object={part} position={place.position} scale={place.scale} name={name ?? `twin:${twin.asset.sha256.slice(0, 8)}`} userData={{ twinKey }} />;
}
