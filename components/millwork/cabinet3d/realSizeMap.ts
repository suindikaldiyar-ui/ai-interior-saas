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

/**
 * ТОРЕЦ ДЕТАЛИ — ВОЛОКНО ВДОЛЬ ТОРЦА (P3D-LDSP).
 *
 * Таблица граней кладёт волокно по правилу раскроя: на лице, боковине и
 * перегородке — вдоль высоты, на дне, крыше и полке — вдоль глубины.
 * Торец плиты при этом получал волокно ПОПЁРЕК себя: на кромке полки
 * 18 мм рисунок шёл вертикально, и кромка читалась гребёнкой — срезом
 * колец поперёк. Кромку в декор печатают вдоль её длины: грань, у которой
 * вдоль волокна меньше `REAL_SIZE_EDGE_M`, а поперёк больше, получает
 * волокно вдоль своей длинной стороны. Лицевые грани деталей (любая
 * сторона от 60 мм) правило не трогает — у них остаётся правило раскроя.
 */
const REAL_SIZE_EDGE_M = 0.06;

/**
 * СВОЁ МЕСТО НА ПЛИТЕ У КАЖДОЙ ДЕТАЛИ (P3D-LDSP).
 *
 * Развёртка считается от центра детали, и все двери одной ширины брали
 * ОДИН И ТОТ ЖЕ кусок рисунка: четыре одинаковые двери в ряд читаются
 * плиткой текстуры, а не деревом. В цеху детали режут из разных мест
 * плиты — и здесь у детали свой сдвиг рисунка (`rsShift`, доли плитки).
 *
 * Сдвиг — ДАННЫЕ, а не формула в шейдере от места меша: открытая створка
 * едет своим мешем, и сдвиг от её места «потёк» бы по двери на ходу. Он
 * считается из ключа детали (`shiftKeyOf`): подвижной — из её
 * идентификатора (закрытая в пачке и едущая своим мешем — один ключ, один
 * рисунок), неподвижной — из места в ряду. Пачка несёт его атрибутом
 * экземпляра, едущий меш — атрибутом вершин, трассировщик читает те же
 * числа. Меш без атрибута получает ноль, и `fract` в шейдере держит это
 * так при любом постоянном значении на месте атрибута.
 */
export const REAL_SIZE_SHIFT = 'rsShift';

/**
 * Строку — в 32 бита: FNV-1a и перемешивание murmur3. Без перемешивания
 * ключи, разные одной последней буквой (`…:door:0` и `…:door:1`), давали
 * почти один сдвиг (0.62/0.68 и 0.61/0.68) — две створки модуля одним куском.
 */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Сдвиг рисунка детали по её ключу: две доли плитки 0…1. */
export function realSizeShiftOf(key: string): [number, number] {
  const h = hash32(key);
  return [(h & 0xffff) / 0x10000, (h >>> 16) / 0x10000];
}

/** Ключ детали для сдвига: подвижная — её идентификатор, неподвижная — место в ряду (мм). */
export function shiftKeyOf(box: { part?: string; position: [number, number, number] }, salt = ''): string {
  if (box.part) return box.part;
  const [x, y, z] = box.position.map((v) => Math.round(v * 1000));
  return `${salt}|${x}|${y}|${z}`;
}

/**
 * Коробка с одним сдвигом на всех вершинах — для меша, который едет сам
 * (створка, ящик): тот же рисунок, что у неё закрытой в пачке.
 */
export function shiftedBox(base: THREE.BufferGeometry, shift: [number, number]): THREE.BufferGeometry {
  const out = base.clone();
  const count = out.getAttribute('position').count;
  const data = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    data[i * 2] = shift[0];
    data[i * 2 + 1] = shift[1];
  }
  out.setAttribute(REAL_SIZE_SHIFT, new THREE.BufferAttribute(data, 2));
  return out;
}

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
  vec2 rsSpan = rsNormal.z > ${REAL_SIZE_THRESHOLD.toFixed(1)} ? rsScale.${REAL_SIZE_FACES.z} : (rsNormal.x > ${REAL_SIZE_THRESHOLD.toFixed(1)} ? rsScale.${REAL_SIZE_FACES.x} : rsScale.${REAL_SIZE_FACES.y});
  if (rsSpan.y < ${REAL_SIZE_EDGE_M.toFixed(2)} && rsSpan.x > rsSpan.y) rsUv = rsUv.yx;
  vMapUv = rsUv / uRealSize + fract(${REAL_SIZE_SHIFT});
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
      `uniform vec2 uRealSize;\nattribute vec2 ${REAL_SIZE_SHIFT};\n` +
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
  options: { mirror?: boolean } = {},
): void {
  if (!texture || !sizeM) {
    unpatch(material);
    if (material.map) {
      material.map = null;
      material.needsUpdate = true;
    }
    material.userData.realSizeM = null;
    material.userData.realSizeMirror = null;
    return;
  }

  /*
   * ОБРАЗЕЦ ИЗ БРОШЮРЫ НЕ БЕСШОВНЫЙ (REFERENCE_ONLY) — повтор зеркальный.
   * Прямой повтор резал бы плиту сеткой швов через каждый образец. Адрес
   * образца свой, поэтому текстура в кэше одна на этот способ повтора.
   */
  const wrap = options.mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  if (texture.wrapS !== wrap || texture.wrapT !== wrap) {
    texture.wrapS = wrap;
    texture.wrapT = wrap;
    texture.needsUpdate = true;
  }

  patch(material);
  uniformOf(material).value.set(sizeM[0], sizeM[1]);
  material.userData.realSizeM = [sizeM[0], sizeM[1]];
  material.userData.realSizeMirror = Boolean(options.mirror);
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
 * × масштаб детали, пара осей по нормали из `REAL_SIZE_FACES`, торец —
 * волокном вдоль себя (`REAL_SIZE_EDGE_M`), деление на размер фото.
 * Геометрия — копия: общая коробка сцены не трогается.
 */
export function realSizeUvGeometry(
  geometry: THREE.BufferGeometry,
  scale: THREE.Vector3,
  sizeM: [number, number],
  /** Сдвиг рисунка детали (`rsShift`) — тот же, что у неё в сцене. */
  shift: [number, number] = [0, 0],
): THREE.BufferGeometry {
  const out = geometry.clone();
  /* Сдвиг уходит в развёртку; атрибут сцены (у пачки — по экземплярам) трассировщику не нужен. */
  if (out.getAttribute(REAL_SIZE_SHIFT)) out.deleteAttribute(REAL_SIZE_SHIFT);
  const position = out.getAttribute('position');
  const normal = out.getAttribute('normal');
  const uv = new Float32Array(position.count * 2);
  const span = { x: scale.x, y: scale.y, z: scale.z };
  for (let i = 0; i < position.count; i += 1) {
    const at = { x: position.getX(i) * scale.x, y: position.getY(i) * scale.y, z: position.getZ(i) * scale.z };
    const face =
      Math.abs(normal.getZ(i)) > REAL_SIZE_THRESHOLD
        ? REAL_SIZE_FACES.z
        : Math.abs(normal.getX(i)) > REAL_SIZE_THRESHOLD
          ? REAL_SIZE_FACES.x
          : REAL_SIZE_FACES.y;
    const across = face[0] as 'x' | 'y' | 'z';
    const along = face[1] as 'x' | 'y' | 'z';
    /* Торец — волокно вдоль своей длинной стороны, как в шейдере сцены. */
    const edge = span[along] < REAL_SIZE_EDGE_M && span[across] > span[along];
    uv[i * 2] = at[edge ? along : across] / sizeM[0] + (shift[0] - Math.floor(shift[0]));
    uv[i * 2 + 1] = at[edge ? across : along] / sizeM[1] + (shift[1] - Math.floor(shift[1]));
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
