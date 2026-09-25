import * as THREE from 'three';

/**
 * ФОТО МАТЕРИАЛА ЛОЖИТСЯ В НАСТОЯЩЕМ РАЗМЕРЕ, А НЕ ПО ДЕТАЛИ.
 *
 * Вся мебель — единичный куб, растянутый матрицей экземпляра (слой 21).
 * Обычная развёртка кладёт картинку от угла до угла грани: фото дуба
 * 600 × 450 мм на фасаде 300 мм сжималось вдвое, на столешнице 3 м
 * растягивалось в пять раз — волокно шло то мелко, то крупно, и клиент
 * видел не тот декор.
 *
 * Здесь координаты текстуры считаются от НАСТОЯЩИХ метров грани:
 * позиция вершины единичного куба умножается на масштаб модели (и
 * экземпляра, если пачка инстансовая) и делится на размер фото. Какую
 * пару осей брать, решает нормаль грани: лицо — X и Y, торцы — Z и Y,
 * верх и низ — X и Z. Масштаб берётся длиной столбцов матрицы, поэтому
 * поворот ряда в углу на размер не влияет.
 *
 * Код стоит внутри `#ifdef USE_MAP`: пока фото нет, шейдер тот же, что
 * был, а `customProgramCacheKey` не даёт трём смешать его с обычным.
 */
const REAL_SIZE_UV = /* glsl */ `
#ifdef USE_MAP
  mat4 rsMatrix = modelMatrix;
  #ifdef USE_INSTANCING
    rsMatrix = modelMatrix * instanceMatrix;
  #endif
  vec3 rsScale = vec3(length(rsMatrix[0].xyz), length(rsMatrix[1].xyz), length(rsMatrix[2].xyz));
  vec3 rsPos = position * rsScale;
  vec3 rsNormal = abs(normal);
  vec2 rsUv = rsNormal.z > 0.5 ? rsPos.xy : (rsNormal.x > 0.5 ? rsPos.zy : rsPos.xz);
  vMapUv = rsUv / uRealSize;
#endif
`;

type RealSizeUniform = { value: THREE.Vector2 };

function uniformOf(material: THREE.Material): RealSizeUniform {
  const data = material.userData as { realSize?: RealSizeUniform };
  if (!data.realSize) data.realSize = { value: new THREE.Vector2(1, 1) };
  return data.realSize;
}

function patch(material: THREE.MeshStandardMaterial): void {
  if (material.userData.realSizePatched === true) return;
  const uniform = uniformOf(material);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRealSize = uniform;
    shader.vertexShader =
      'uniform vec2 uRealSize;\n' +
      shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>\n${REAL_SIZE_UV}`);
  };
  material.customProgramCacheKey = () => 'real-size-map';
  material.userData.realSizePatched = true;
  material.needsUpdate = true;
}

/**
 * Снять правку шейдера: материал снова рисует развёртку грани.
 *
 * Нужна там, где один материал знает оба пути — столешница из каталога
 * материалов (настоящий размер) и столешница из выбора артикула с
 * повторами по `textureRepeat`. Оставленная правка положила бы вторую
 * картинку по размеру первой.
 */
export function unpatch(material: THREE.MeshStandardMaterial): void {
  if (material.userData.realSizePatched !== true) return;
  // Собственные свойства убираются — снова работают прототипные.
  delete (material as { onBeforeCompile?: unknown }).onBeforeCompile;
  delete (material as { customProgramCacheKey?: unknown }).customProgramCacheKey;
  material.userData.realSizePatched = false;
  material.needsUpdate = true;
}

/**
 * Положить фото на материал в настоящем размере — или снять его.
 *
 * `sizeM` — размер фото в метрах, тот же `tiling.moduleSize`, что у
 * позиции каталога. Без размера фото не кладётся вовсе: растянуть его по
 * детали значит показать клиенту не тот рисунок.
 */
export function setRealSizeMap(
  material: THREE.MeshStandardMaterial,
  texture: THREE.Texture | null,
  sizeM: [number, number] | null,
): void {
  if (!texture || !sizeM) {
    unpatch(material);
    if (material.map) {
      material.map = null;
      material.needsUpdate = true;
    }
    material.userData.realSizeM = null;
    return;
  }

  patch(material);
  uniformOf(material).value.set(sizeM[0], sizeM[1]);
  material.userData.realSizeM = [sizeM[0], sizeM[1]];
  if (material.map !== texture) {
    material.map = texture;
    material.needsUpdate = true;
  }
}

/** Размер фото на материале — для приёмки: меряется то, что стоит в сцене. */
export function realSizeOf(material: THREE.Material): [number, number] | null {
  const size = material.userData.realSizeM as [number, number] | null | undefined;
  return Array.isArray(size) ? [size[0], size[1]] : null;
}
