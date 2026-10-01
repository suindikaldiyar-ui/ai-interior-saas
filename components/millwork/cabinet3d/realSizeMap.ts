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
/**
 * КАКАЯ ПАРА ОСЕЙ ЛОЖИТСЯ НА ГРАНЬ — ОДНА ТАБЛИЦА НА ДВА ИСПОЛНИТЕЛЯ.
 *
 * Лицо (нормаль по Z) — X и Y, торцы (по X) — Z и Y, верх и низ — X и Z;
 * грань «своя» оси, если нормаль по ней больше половины. Из таблицы
 * собирается строка шейдера сцены и запекание для трассировщика
 * (`realSizeUvGeometry`, слой 54): он шейдеров сцены не выполняет, и
 * вторая, написанная руками формула однажды разошлась бы с первой.
 */
const REAL_SIZE_FACES = { z: 'xy', x: 'zy', y: 'xz' } as const;
const REAL_SIZE_THRESHOLD = 0.5;

const REAL_SIZE_UV = /* glsl */ `
#ifdef USE_MAP
  mat4 rsMatrix = modelMatrix;
  #ifdef USE_INSTANCING
    rsMatrix = modelMatrix * instanceMatrix;
  #endif
  vec3 rsScale = vec3(length(rsMatrix[0].xyz), length(rsMatrix[1].xyz), length(rsMatrix[2].xyz));
  vec3 rsPos = position * rsScale;
  vec3 rsNormal = abs(normal);
  vec2 rsUv = rsNormal.z > ${REAL_SIZE_THRESHOLD.toFixed(1)} ? rsPos.${REAL_SIZE_FACES.z} : (rsNormal.x > ${REAL_SIZE_THRESHOLD.toFixed(1)} ? rsPos.${REAL_SIZE_FACES.x} : rsPos.${REAL_SIZE_FACES.y});
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

/**
 * ТА ЖЕ РАЗВЁРТКА — В КООРДИНАТАХ ГЕОМЕТРИИ, ДЛЯ ТРАССИРОВЩИКА (слой 54).
 *
 * Трассировщик читает координаты текстуры из геометрии, а не из шейдера,
 * поэтому развёртка «в настоящем размере» для него запекается сюда: позиция
 * × масштаб детали, пара осей по нормали из `REAL_SIZE_FACES`, деление на
 * размер фото. Геометрия — копия: общая коробка сцены не трогается.
 */
export function realSizeUvGeometry(
  geometry: THREE.BufferGeometry,
  scale: THREE.Vector3,
  sizeM: [number, number],
): THREE.BufferGeometry {
  const out = geometry.clone();
  const position = out.getAttribute('position');
  const normal = out.getAttribute('normal');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const at = { x: position.getX(i) * scale.x, y: position.getY(i) * scale.y, z: position.getZ(i) * scale.z };
    const face =
      Math.abs(normal.getZ(i)) > REAL_SIZE_THRESHOLD
        ? REAL_SIZE_FACES.z
        : Math.abs(normal.getX(i)) > REAL_SIZE_THRESHOLD
          ? REAL_SIZE_FACES.x
          : REAL_SIZE_FACES.y;
    uv[i * 2] = at[face[0] as 'x' | 'y' | 'z'] / sizeM[0];
    uv[i * 2 + 1] = at[face[1] as 'x' | 'y' | 'z'] / sizeM[1];
  }
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

/** Шейдер сцены — для приёмки: тот ли он, что собран из таблицы граней. */
export const REAL_SIZE_UV_SOURCE = REAL_SIZE_UV;

/** Размер фото на материале — для приёмки: меряется то, что стоит в сцене. */
export function realSizeOf(material: THREE.Material): [number, number] | null {
  const size = material.userData.realSizeM as [number, number] | null | undefined;
  return Array.isArray(size) ? [size[0], size[1]] : null;
}
