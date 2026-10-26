'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProfileFinish } from '@/types/millwork';
import { PROFILE_FINISHES, PROFILE_HEX } from '@/lib/millwork/vitrine';
import { HANDLE_ENV_INTENSITY, cadEnvironment } from './cadLook';

/**
 * КАК ВЫГЛЯДИТ ПРОФИЛЬ ВИТРИНЫ (P1) — ОДНО МЕСТО НА ПАЧКУ РЯДА И ЕДУЩУЮ ДВЕРЬ.
 *
 * Покрытие лежит на модуле (`VitrineSpec.profile`), здесь только его картинка;
 * цвет — `PROFILE_HEX` (VISUAL_ONLY: позиции профиля в каталоге нет). Два
 * набора, как у стекла: САПР-вид — плоский цвет без бликов (ловушка 299),
 * «Интерьер» — металл. Оба создаются ОДИН раз на отрисовщик: переключение
 * режима меняет ссылку у пачки, а не материал.
 *
 * Металл «Интерьера» отражает СВОЮ карту окружения — ту же, что у ручек
 * (`cadEnvironment`, та же сила `HANDLE_ENV_INTENSITY`): окружение сцены
 * вечером и ночью гаснет, и серебро на нём становилось тёмно-серым, когда
 * ручка рядом оставалась металлом. Карта поворачивается вместе с окружением
 * сцены (оно смотрит к открытой стороне).
 */
export type ProfileMaterials = Record<ProfileFinish, THREE.MeshStandardMaterial>;

function makeProfile(finish: ProfileFinish, design: boolean, gl: THREE.WebGLRenderer): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: PROFILE_HEX[finish],
    metalness: design ? 0.9 : 0.15,
    roughness: design ? (finish === 'black' ? 0.45 : 0.32) : 0.6,
  });
  if (design) {
    material.envMap = cadEnvironment(gl);
    material.envMapIntensity = HANDLE_ENV_INTENSITY;
  }
  material.name = `profile:${finish}`;
  /* Признак для приёмки и рендера по чертежу: это профиль витрины, а не мебель. */
  material.userData.profile = finish;
  return material;
}

export function useProfileMaterials(design: boolean): ProfileMaterials {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const cad = useMemo<ProfileMaterials>(
    () => Object.fromEntries(PROFILE_FINISHES.map((finish) => [finish, makeProfile(finish, false, gl)])) as ProfileMaterials,
    [gl],
  );
  /* Набор «Интерьера» — при первом входе в режим и до конца жизни сцены. */
  const metal = useRef<ProfileMaterials | null>(null);
  if (design && !metal.current) {
    metal.current = Object.fromEntries(PROFILE_FINISHES.map((finish) => [finish, makeProfile(finish, true, gl)])) as ProfileMaterials;
  }
  /* Отражения повёрнуты так же, как окружение сцены — проверка дешёвая, кадр она не просит. */
  useFrame(() => {
    for (const material of Object.values(metal.current ?? {})) {
      if (material.envMap && material.envMapRotation.y !== scene.environmentRotation.y) material.envMapRotation.copy(scene.environmentRotation);
    }
  });
  useEffect(
    () => () => {
      for (const material of Object.values(cad)) material.dispose();
      for (const material of Object.values(metal.current ?? {})) material.dispose();
    },
    [cad],
  );
  return design && metal.current ? metal.current : cad;
}
