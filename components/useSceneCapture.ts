'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { heroCamera } from '@/lib/cameraFraming';
import {
  CAPTURE_ASPECT,
  CAPTURE_HEIGHT,
  CAPTURE_WIDTH,
  CONTACT_SHADOWS_NAME,
  HELPER_FLAG,
  JPEG_QUALITY,
  SKY_NAME,
  registerCapture,
} from '@/lib/captureRegistry';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { CaptureFraming, CaptureResult } from '@/types/render';

export { CONTACT_SHADOWS_NAME } from '@/lib/captureRegistry';

type CaptureFn = (framing: CaptureFraming) => Promise<CaptureResult>;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Компонент внутри <Canvas>: регистрирует функцию захвата, ничего не рендерит. */
export function SceneCapture() {
  const { gl, scene, camera } = useThree();
  const captureMode = useInteriorStore((s) => s.captureMode);
  const committedRef = useRef<(() => void) | null>(null);

  /**
   * Сигнал «React закоммитил режим съёмки».
   *
   * Ждать пары requestAnimationFrame нельзя: rAF не связан с коммитом React,
   * и захват успевал снять кадр до того, как гизмо, каркас выделения и сетка
   * уходили из графа сцены — в кадр попадали служебные элементы.
   * useEffect же выполняется строго после commit-фазы, когда R3F уже применил
   * все добавления и удаления объектов.
   */
  useEffect(() => {
    if (!captureMode) return;
    const resolve = committedRef.current;
    if (resolve) {
      committedRef.current = null;
      resolve();
    }
  }, [captureMode]);

  useEffect(() => {
    const clay = new THREE.MeshStandardMaterial({
      color: '#D8D5D0',
      roughness: 0.9,
      metalness: 0,
    });

    const run: CaptureFn = async (framing) => {
      const store = useInteriorStore.getState();
      const perspective = camera as THREE.PerspectiveCamera;

      const prevSize = new THREE.Vector2();
      gl.getSize(prevSize);
      const prevPixelRatio = gl.getPixelRatio();
      const prevAspect = perspective.aspect;
      const prevCeiling = store.showCeiling;
      const prevFog = scene.fog;
      const prevBackground = scene.background;
      const prevClear = new THREE.Color();
      gl.getClearColor(prevClear);
      const prevClearAlpha = gl.getClearAlpha();
      const contactShadows = scene.getObjectByName(CONTACT_SHADOWS_NAME);
      // Окон может быть несколько — getObjectByName вернул бы только первое.
      const skies: THREE.Object3D[] = [];
      scene.traverse((object) => {
        if (object.name === SKY_NAME) skies.push(object);
      });

      // Потолок на время съёмки включаем принудительно: без него сверху
      // остаётся чёрный клин, и модель читает комнату как открытую.
      if (!prevCeiling) store.setShowCeiling(true);

      // Резолвер ставим ДО переключения флага, иначе коммит может опередить нас.
      const committed = new Promise<void>((resolve) => {
        committedRef.current = resolve;
      });

      store.setCaptureMode(true);

      try {
        // Ждём именно коммит React, а не просто следующий кадр: только после
        // него хелперы гарантированно выброшены из графа сцены.
        // Таймаут — страховка, чтобы захват не завис навсегда.
        await Promise.race([
          committed,
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);
        committedRef.current = null;
        // Ещё один кадр: R3F успевает отрисовать уже очищенную сцену.
        await nextFrame();

        gl.setPixelRatio(1);
        // updateStyle=false: CSS-размер канваса не трогаем, вёрстка не прыгает.
        gl.setSize(CAPTURE_WIDTH, CAPTURE_HEIGHT, false);

        let shotCamera: THREE.PerspectiveCamera;
        if (framing === 'hero') {
          const hero = heroCamera(store.room);
          shotCamera = new THREE.PerspectiveCamera(hero.fov, CAPTURE_ASPECT, 0.1, 200);
          shotCamera.position.set(hero.position[0], hero.position[1], hero.position[2]);
          shotCamera.lookAt(hero.target[0], hero.target[1], hero.target[2]);
          shotCamera.updateProjectionMatrix();
        } else {
          perspective.aspect = CAPTURE_ASPECT;
          perspective.updateProjectionMatrix();
          shotCamera = perspective;
        }

        // Второй слой защиты: гасим всё, что помечено как служебное,
        // даже если какой-то хелпер забыли завести под captureMode.
        const hidden: THREE.Object3D[] = [];
        scene.traverse((object) => {
          if (object.userData?.[HELPER_FLAG] && object.visible) {
            object.visible = false;
            hidden.push(object);
          }
        });

        gl.render(scene, shotCamera);
        const beauty = gl.domElement.toDataURL('image/jpeg', JPEG_QUALITY);

        /*
         * Clay: чистая геометрия без цвета и текстур — по ней модель читает
         * форму комнаты заметно точнее, чем по цветному кадру.
         *
         * «Небо» за окном, туман и тёмный фон обязаны уйти: иначе окно станет
         * таким же серым прямоугольником, как стена, и модель его не увидит.
         */
        if (contactShadows) contactShadows.visible = false;
        for (const s of skies) s.visible = false;
        scene.fog = null;
        scene.background = null;
        gl.setClearColor(0xffffff, 1);
        scene.overrideMaterial = clay;

        gl.render(scene, shotCamera);
        const clayShot = gl.domElement.toDataURL('image/jpeg', JPEG_QUALITY);

        for (const object of hidden) object.visible = true;

        return { beauty, clay: clayShot };
      } finally {
        // Восстанавливаем всё безусловно: если захват упадёт посередине,
        // вьюпорт останется 1536×1024 и вёрстка поедет.
        scene.overrideMaterial = null;
        if (contactShadows) contactShadows.visible = true;
        for (const s of skies) s.visible = true;
        scene.fog = prevFog;
        scene.background = prevBackground;
        gl.setClearColor(prevClear, prevClearAlpha);
        if (!prevCeiling) store.setShowCeiling(false);
        gl.setPixelRatio(prevPixelRatio);
        gl.setSize(prevSize.x, prevSize.y, false);
        perspective.aspect = prevAspect;
        perspective.updateProjectionMatrix();
        committedRef.current = null;
        store.setCaptureMode(false);
      }
    };

    registerCapture(run);
    return () => {
      registerCapture(null);
      clay.dispose();
    };
  }, [gl, scene, camera]);

  return null;
}
