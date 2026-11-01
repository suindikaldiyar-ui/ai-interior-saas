'use client';

import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { HardwareTwin, TwinFinish, TwinRole } from '@/types/catalog';
import { twinPlacement, twinRoleOf } from '@/lib/millwork/hardwareTwin';
import { CATALOG_BUCKET, storageUrl } from '@/lib/supabase/config';
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
const materials = new Map<TwinFinish, THREE.MeshStandardMaterial>();
function finishMaterial(finish: TwinFinish): THREE.MeshStandardMaterial {
  const known = materials.get(finish);
  if (known) return known;
  const f = FINISH[finish];
  const material = new THREE.MeshStandardMaterial({ color: f.color, metalness: f.metalness, roughness: f.roughness, side: THREE.DoubleSide });
  materials.set(finish, material);
  return material;
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
function rolePart(scene: THREE.Group, twin: HardwareTwin, role: TwinRole): THREE.Group {
  const part = scene.clone(true);
  const material = twin.finish ? finishMaterial(twin.finish) : null;
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
    if (material) mesh.material = material;
    mesh.castShadow = true;
    mesh.name = `twin:${role}`;
  });
  for (const mesh of foreign) mesh.parent?.remove(mesh);
  return part;
}

/** Одна модель реестра в точке движка. */
export function TwinModel({
  twin,
  role,
  anchorM,
  mirror = false,
  name,
}: {
  twin: HardwareTwin;
  role: TwinRole;
  anchorM: [number, number, number];
  mirror?: boolean;
  name?: string;
}) {
  const scene = useTwinScene(twin);
  const part = useMemo(() => (scene ? rolePart(scene, twin, role) : null), [scene, twin, role]);
  if (!part) return null;
  const place = twinPlacement(twin, anchorM, mirror);
  return <primitive object={part} position={place.position} scale={place.scale} name={name ?? `twin:${twin.asset.sha256.slice(0, 8)}`} />;
}
