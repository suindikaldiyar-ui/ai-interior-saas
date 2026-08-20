'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * Кэш текстур каталога.
 *
 * Без него каждое переключение материала уходит в сеть: клиент щёлкает
 * по вариантам пола на встрече, а картинка каждый раз грузится заново.
 * Кэш живёт на уровне модуля — один экземпляр текстуры на URL.
 */

const cache = new Map<string, THREE.Texture>();
const pending = new Map<string, Promise<THREE.Texture>>();

let loader: THREE.TextureLoader | null = null;

function getLoader(): THREE.TextureLoader {
  if (!loader) {
    loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
  }
  return loader;
}

export function loadTexture(url: string): Promise<THREE.Texture> {
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);

  const inFlight = pending.get(url);
  if (inFlight) return inFlight;

  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    getLoader().load(
      url,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        cache.set(url, texture);
        pending.delete(url);
        resolve(texture);
      },
      undefined,
      (err) => {
        pending.delete(url);
        reject(err);
      },
    );
  });

  pending.set(url, promise);
  return promise;
}

/**
 * Текстура поверхности с нужным числом повторов.
 *
 * Клон нужен потому, что repeat живёт в самой текстуре: пол и стена могут
 * ссылаться на один файл, но повторяться разное число раз.
 */
export function useSurfaceTexture(
  url: string,
  repeatX: number,
  repeatY: number,
): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    let cancelled = false;
    let created: THREE.Texture | null = null;

    loadTexture(url)
      .then((base) => {
        if (cancelled) return;
        created = base.clone();
        created.needsUpdate = true;
        created.wrapS = THREE.RepeatWrapping;
        created.wrapT = THREE.RepeatWrapping;
        created.repeat.set(repeatX, repeatY);
        setTexture(created);
      })
      .catch(() => {
        if (!cancelled) setTexture(null);
      });

    return () => {
      cancelled = true;
      // Освобождаем только клон: исходник остаётся в общем кэше.
      created?.dispose();
    };
  }, [url, repeatX, repeatY]);

  return texture;
}

/** Прогрев кэша: пока клиент смотрит на сцену, образцы уже грузятся. */
export function prefetchTextures(urls: string[]): void {
  for (const url of urls) {
    if (url && !cache.has(url)) void loadTexture(url).catch(() => undefined);
  }
}
