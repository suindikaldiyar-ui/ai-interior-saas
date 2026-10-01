import * as THREE from 'three';
import type { WireCamera, WireScene } from './pathTraceWire';

/**
 * СЦЕНА РЕНДЕРА ИЗ ДАННЫХ — ОБРАТНАЯ СБОРКА (слой 54).
 *
 * Её зовёт фоновый поток рендера, и её же зовёт приёмка без видеокарты:
 * что `wireSceneOf` упаковал, то здесь и собирается — детали с теми же
 * матрицами, материалы с теми же числами, фото по тем же гнёздам, свет и
 * камера. Своих правил здесь нет; DOM не нужен.
 */

function cameraOf(wire: WireCamera): THREE.Camera {
  const camera =
    wire.kind === 'perspective'
      ? new THREE.PerspectiveCamera(wire.fov, wire.aspect, wire.near, wire.far)
      : new THREE.OrthographicCamera(wire.left, wire.right, wire.top, wire.bottom, wire.near, wire.far);
  camera.position.fromArray(wire.position);
  camera.quaternion.fromArray(wire.quaternion);
  camera.scale.fromArray(wire.scale);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

export function sceneFromWire(wire: WireScene): { scene: THREE.Scene; camera: THREE.Camera; dispose: () => void } {
  const textures = new Map<string, THREE.Texture>();
  for (const item of wire.textures) {
    const texture =
      item.source.kind === 'bitmap'
        ? new THREE.Texture(item.source.bitmap)
        : new THREE.DataTexture(
            item.source.data as unknown as BufferSource,
            item.source.width,
            item.source.height,
            item.source.format as THREE.PixelFormat,
            item.source.type as THREE.TextureDataType,
          );
    /* Фото развёрнуто и умножено на альфу ещё на главном потоке, при создании `ImageBitmap`. */
    texture.flipY = false;
    texture.premultiplyAlpha = false;
    texture.wrapS = item.wrapS as THREE.Wrapping;
    texture.wrapT = item.wrapT as THREE.Wrapping;
    texture.repeat.fromArray(item.repeat);
    texture.offset.fromArray(item.offset);
    texture.center.fromArray(item.center);
    texture.rotation = item.rotation;
    texture.colorSpace = item.colorSpace as THREE.ColorSpace;
    texture.generateMipmaps = item.generateMipmaps;
    texture.minFilter = item.minFilter as THREE.MinificationTextureFilter;
    texture.magFilter = item.magFilter as THREE.MagnificationTextureFilter;
    texture.anisotropy = item.anisotropy;
    texture.needsUpdate = true;
    textures.set(item.id, texture);
  }

  const loader = new THREE.MaterialLoader();
  const materials = new Map<string, THREE.Material>();
  for (const item of wire.materials) {
    const material = loader.parse(item.json);
    for (const [slot, id] of Object.entries(item.maps)) {
      const texture = textures.get(id);
      if (!texture) throw new Error(`фото материала (${slot}) не доехало до рендера`);
      (material as unknown as Record<string, unknown>)[slot] = texture;
    }
    material.needsUpdate = true;
    materials.set(item.id, material);
  }

  const geometries = new Map<string, THREE.BufferGeometry>();
  for (const item of wire.geometries) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(item.attributes)) {
      geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized));
    }
    if (item.index) geometry.setIndex(new THREE.BufferAttribute(item.index, 1));
    geometries.set(item.id, geometry);
  }

  const scene = new THREE.Scene();
  for (const item of wire.meshes) {
    const geometry = geometries.get(item.geometry);
    const material = materials.get(item.material);
    if (!geometry || !material) {
      throw new Error('деталь не доехала до рендера: у неё нет геометрии или материала');
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.fromArray(item.matrix);
    scene.add(mesh);
  }
  for (const item of wire.lights) {
    const key = new THREE.DirectionalLight(new THREE.Color().fromArray(item.color), item.intensity);
    key.position.fromArray(item.position);
    key.target.position.fromArray(item.target);
    scene.add(key, key.target);
  }
  scene.background = new THREE.Color(wire.background);
  scene.environmentIntensity = wire.environmentIntensity;
  scene.updateMatrixWorld(true);

  return {
    scene,
    camera: cameraOf(wire.camera),
    /* Своё у сцены — всё, что собрано здесь; фото закрываются вместе с картами. */
    dispose: () => {
      textures.forEach((texture) => {
        texture.dispose();
        const image = texture.image as { close?: () => void } | null;
        if (image && typeof image.close === 'function') image.close();
      });
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
