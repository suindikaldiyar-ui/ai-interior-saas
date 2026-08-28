'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { sceneCamera, type SceneView } from '@/lib/cameraFraming';
import type { RoomConfig } from '@/types/interior';

/** Камере нужны только габариты: цвета и окна к ракурсу отношения не имеют. */
type RoomSize = Pick<RoomConfig, 'width' | 'depth' | 'height'>;

/**
 * Ракурс сцены.
 *
 * Камера ставится ОДИН раз на смену вида, а дальше клиент крутит её сам:
 * перехватывать управление каждый кадр — значит отнимать у него мышь.
 *
 * `invalidate()` обязателен: при `frameloop="demand"` кадр без него просто
 * не перерисуется, и вид останется прежним при верном коде.
 */

type Props = {
  room: RoomSize;
  view: SceneView;
};

type OrbitLike = {
  target: { set: (x: number, y: number, z: number) => void };
  update: () => void;
};

export default function SceneCamera({ room, view }: Props) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitLike | null;
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const framing = sceneCamera(room as RoomConfig, view);

    camera.position.set(...framing.position);
    if ('fov' in camera) {
      (camera as unknown as { fov: number }).fov = framing.fov;
      (camera as unknown as { updateProjectionMatrix: () => void }).updateProjectionMatrix();
    }

    if (controls) {
      controls.target.set(...framing.target);
      controls.update();
    } else {
      camera.lookAt(...framing.target);
    }

    invalidate();
  }, [camera, controls, invalidate, room.width, room.depth, room.height, view, room]);

  return null;
}
