import { WOOD_TILE_MM, WOOD_TILE_PX, type WoodPattern } from './woodPattern';

/**
 * ПИКСЕЛИ ДЕМОНСТРАЦИОННОГО РИСУНКА ДЕРЕВА — отдельно от решения «чем
 * рисовать» (`woodPattern.ts`).
 *
 * Решение нужно каталогу на каждом экране и едет в первую загрузку;
 * генератор нужен только фоновому потоку сцены, образцу в панели и приёмке
 * — он грузится по требованию. Функции чистые: ни three, ни DOM, пиксели
 * считаются числами, и приёмка мерит в node тот же код, что рисует сцена.
 */

const HEX = /^#[0-9a-f]{6}$/i;

/** Строку — в 32 бита (FNV-1a): зерно генератора. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Генератор чисел 0…1 от зерна (mulberry32): детерминирован, без Math.random. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Шум на решётке, свёрнутой по краям: `nx × ny` узлов на плитку.
 * Значение в узле — из хэша (узел mod размер решётки), поэтому плитка
 * продолжается сама в себя без шва.
 */
function periodicNoise(nx: number, ny: number, seed: number): (u: number, v: number) => number {
  const values = new Float32Array(nx * ny);
  const next = rng(seed);
  for (let i = 0; i < values.length; i += 1) values[i] = next() * 2 - 1;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (u: number, v: number) => {
    const x = (((u % 1) + 1) % 1) * nx;
    const y = (((v % 1) + 1) % 1) * ny;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const x1 = (x0 + 1) % nx;
    const y1 = (y0 + 1) % ny;
    const a = values[y0 * nx + x0];
    const b = values[y0 * nx + x1];
    const c = values[y1 * nx + x0];
    const d = values[y1 * nx + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Сумма октав свёрнутого шума: решётка удваивается, плитка остаётся бесшовной. */
function periodicFbm(nx: number, ny: number, octaves: number, seed: number): (u: number, v: number) => number {
  const layers = Array.from({ length: octaves }, (_, i) => periodicNoise(nx << i, ny << i, seed + i * 7919));
  return (u, v) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (const layer of layers) {
      sum += layer(u, v) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** Окно плитки в её долях: `[u0, v0, u1, v1]`. Вся плитка — `[0, 0, 1, 1]`. */
export type WoodWindow = [number, number, number, number];

/**
 * ПИКСЕЛИ ПЛИТКИ — RGBA, sRGB, `width × height`.
 *
 * `window` — какой кусок плитки рисовать: вся плитка идёт в сцену, а образец
 * в панели — окно 150 × 150 мм в 128 пикселях за миллисекунды, тем же
 * рисунком. Поры и кольца привязаны к миллиметрам плитки, а не к пикселям:
 * окно показывает то же дерево, что сцена, только своим масштабом.
 *
 * Тёмность точки складывается из колец (тонкая тёмная линия на границе
 * годичного слоя), пор (короткие штрихи вдоль волокна) и медленного
 * разнотона по плашкам; затем она приводится к нулевому среднему и
 * единичному разбросу, а цвет точки — средний цвет декора, умноженный на
 * (1 − контраст · тёмность) в ЛИНЕЙНОМ пространстве. Поэтому средний цвет
 * плитки равен цвету декора, а разброс — его контрасту.
 */
export function woodPixels(
  pattern: WoodPattern,
  width: number,
  height: number,
  window: WoodWindow = [0, 0, 1, 1],
): Uint8ClampedArray {
  if (!HEX.test(pattern.hex)) throw new Error(`Цвет декора «${pattern.hex}» — не #rrggbb: рисунок не строится.`);
  const [u0, v0, u1, v1] = window;
  if (!(u1 > u0 && v1 > v0)) throw new Error(`Окно плитки [${window.join(', ')}] пустое: рисунок не строится.`);
  /*
   * МАСШТАБ ПОПЕРЁК ВОЛОКНА: числа полей ниже подобраны на плитку 400 мм.
   * Плитка шире — узлов поперёк во столько же раз больше: изгиб, разнотон
   * и полосы остаются тех же миллиметров, а не растягиваются с плиткой.
   */
  const across = WOOD_TILE_MM[0] / 400;
  const n = (cells: number) => Math.max(1, Math.round(cells * across));
  const seed = hash32(pattern.seed);
  const random = rng(seed);

  /* Кольца: сколько их поперёк плитки — из шага колец; целое, иначе шов. */
  const rings = Math.max(8, Math.round(WOOD_TILE_MM[0] / Math.max(1.5, pattern.ringMm)));
  /* Плашки (ламели) поперёк волокна: по одной на 160–200 мм, у каждой свой тон и свои дуги. */
  const plankCount = Math.round(across * 2) + Math.floor(random() * Math.max(2, Math.round(across)));
  const cuts = [0];
  for (let i = 1; i < plankCount; i += 1) cuts.push(i / plankCount + ((random() - 0.5) * 0.12) / across);
  cuts.push(1);
  const planks = cuts.slice(0, -1).map((from, i) => ({
    from,
    to: cuts[i + 1],
    tone: (random() - 0.5) * 0.9,
    /* Центр «собора» внутри плашки и сила дуг: около нуля — прямослой. */
    centre: from + (cuts[i + 1] - from) * (0.3 + random() * 0.4),
    arch: random() < 0.55 ? 0.6 + random() * 1.4 : 0.15 * random(),
    /* Сколько дуг вдоль плитки: целое — бесшовно по v. */
    loops: 1 + Math.floor(random() * 2),
    phase: random(),
    density: 0.85 + random() * 0.3,
  }));

  /*
   * МЕДЛЕННЫЕ ПОЛЯ — НА СВЁРНУТОЙ СЕТКЕ, А ВЫБОРКА РАЗДЕЛЬНАЯ.
   *
   * Изгиб колец и разнотон меняются на десятки миллиметров: считать их
   * в каждом из двух миллионов пикселей — девять секунд на плитку. Сетка
   * свёрнута так же, как плитка, — выборка из неё бесшовна; а всё, что
   * зависит только от столбца или только от строки (узлы и веса), считается
   * один раз на столбец и на строку, а не на пиксель.
   */
  type Axis = { lo: Int32Array; hi: Int32Array; t: Float32Array };
  const axis = (cells: number, count: number, smooth: boolean, from: number, to: number): Axis => {
    const lo = new Int32Array(count);
    const hi = new Int32Array(count);
    const t = new Float32Array(count);
    for (let k = 0; k < count; k += 1) {
      const f = (from + ((k + 0.5) / count) * (to - from)) * cells - (smooth ? 0 : 0.5);
      const f0 = Math.floor(f);
      const frac = f - f0;
      lo[k] = ((f0 % cells) + cells) % cells;
      hi[k] = (lo[k] + 1) % cells;
      t[k] = smooth ? frac * frac * frac * (frac * (frac * 6 - 15) + 10) : frac;
    }
    return { lo, hi, t };
  };
  type Field = { values: Float32Array; gx: number; ax: Axis; ay: Axis };
  const sampled = (gx: number, gy: number, fn: (u: number, v: number) => number): Field => {
    const values = new Float32Array(gx * gy);
    for (let y = 0; y < gy; y += 1) for (let x = 0; x < gx; x += 1) values[y * gx + x] = fn(x / gx, y / gy);
    return { values, gx, ax: axis(gx, width, false, u0, u1), ay: axis(gy, height, false, v0, v1) };
  };
  /* Шум пор — сразу на своих узлах: веса по столбцам и строкам те же. */
  const lattice = (nx: number, ny: number, salt: number): Field => {
    const values = new Float32Array(nx * ny);
    const next = rng(seed + salt);
    for (let k = 0; k < values.length; k += 1) values[k] = next() * 2 - 1;
    return { values, gx: nx, ax: axis(nx, width, true, u0, u1), ay: axis(ny, height, true, v0, v1) };
  };
  const at = (f: Field, i: number, j: number) => {
    const v = f.values;
    const xa = f.ax.lo[i];
    const xb = f.ax.hi[i];
    const tx = f.ax.t[i];
    const ra = f.ay.lo[j] * f.gx;
    const rb = f.ay.hi[j] * f.gx;
    const ty = f.ay.t[j];
    const a = v[ra + xa];
    const b = v[ra + xb];
    const c = v[rb + xa];
    const d = v[rb + xb];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const warp = sampled(n(128), 128, periodicFbm(n(4), 2, 4, seed + 11));
  const wobble = sampled(n(256), 128, periodicFbm(n(16), 4, 3, seed + 23));
  const shade = sampled(n(64), 64, periodicFbm(n(3), 2, 3, seed + 53));
  /* Неравный шаг колец: медленный шум ПОПЕРЁК волокна — кольца то гуще, то реже. */
  const spacing = sampled(n(256), 4, periodicFbm(n(12), 1, 3, seed + 61));
  /* Продольные полосы тона: густо поперёк, редко вдоль — как у распила. */
  const streaks = sampled(n(512), 16, periodicFbm(n(48), 2, 3, seed + 67));
  /* Толщина поздней линии: у одних колец жирная, у других еле видна. */
  const bold = sampled(n(512), 32, periodicFbm(n(64), 4, 2, seed + 71));
  /* Наклон «собора»: центр дуг плывёт вдоль волокна, дуги не симметричны. */
  const drift = sampled(n(4), 64, periodicFbm(n(1), 3, 2, seed + 73));
  /* Поры — узлами на миллиметры плитки (0.78 и 0.43 мм поперёк), а не на пиксели окна. */
  const pores = lattice(Math.round(WOOD_TILE_PX[0] * 0.5), Math.max(4, Math.round(WOOD_TILE_PX[1] / 48)), 37);
  const poresFine = lattice(Math.round(WOOD_TILE_PX[0] * 0.9), Math.max(8, Math.round(WOOD_TILE_PX[1] / 20)), 41);

  /* Что зависит только от столбца — плашка и её ширина. */
  const plankOf = new Int32Array(width);
  for (let i = 0; i < width; i += 1) {
    const u = u0 + ((i + 0.5) / width) * (u1 - u0);
    const uw = u - Math.floor(u);
    let p = planks.findIndex((pl) => uw >= pl.from && uw < pl.to);
    if (p < 0) p = planks.length - 1;
    plankOf[i] = p;
  }
  /* Профиль поздней линии кольца — таблицей: резкая тёмная граница слоя. */
  const LINE = 1024;
  const lineTable = new Float32Array(LINE + 1);
  for (let k = 0; k <= LINE; k += 1) lineTable[k] = Math.exp(-((((k / LINE) * 0.5) / 0.06) ** 2));
  const smooth = (a: number, b: number, x: number) => {
    const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
    return t * t * (3 - 2 * t);
  };

  const field = new Float32Array(width * height);
  let sum = 0;
  const archOf = new Float32Array(planks.length);
  for (let j = 0; j < height; j += 1) {
    const v = v0 + ((j + 0.5) / height) * (v1 - v0);
    /* Дуга «собора» — периодично по v: у каждой плашки на этой строке своя. */
    for (let p = 0; p < planks.length; p += 1) {
      const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * (v * planks[p].loops + planks[p].phase));
      archOf[p] = (planks[p].arch * wave * wave * 0.05) / across;
    }
    const row = j * width;
    for (let i = 0; i < width; i += 1) {
      const p = plankOf[i];
      const plank = planks[p];
      const u = u0 + ((i + 0.5) / width) * (u1 - u0);
      const uw = u - Math.floor(u);
      const width_ = plank.to - plank.from;
      /* Центр дуг плывёт вдоль волокна: соборы клонятся, а не стоят зеркалом. */
      const du = uw - plank.centre - at(drift, i, j) * width_ * 0.18;
      const arch = archOf[p];
      const ringCoord =
        Math.sqrt(du * du + arch * arch) * rings * plank.density +
        at(spacing, i, j) * 3 +
        at(warp, i, j) * 0.8 +
        at(wobble, i, j) * 0.22;
      const w = ringCoord - Math.floor(ringCoord);
      /* Ранняя древесина светлее, к концу слоя темнеет, граница — резкой линией. */
      const late = smooth(0.4, 0.94, w);
      const edge = lineTable[((w > 0.5 ? 1 - w : w) * 2 * LINE) | 0];
      const thick = 0.55 + 0.9 * Math.max(0, at(bold, i, j) + 0.25);
      /* Поры: короткие тёмные штрихи вдоль волокна, гуще в позднем слое. */
      const pa = at(pores, i, j) - 0.45;
      const pb = at(poresFine, i, j) - 0.6;
      const pore = (pa > 0 ? pa * 2.2 : 0) + (pb > 0 ? pb * 1.6 : 0);
      const dark =
        late * 0.4 +
        edge * thick * 0.55 +
        pore * (0.22 + late * 0.4) +
        at(streaks, i, j) * 0.45 +
        at(shade, i, j) * 0.3 +
        plank.tone * 0.25;
      field[row + i] = dark;
      sum += dark;
    }
  }

  const mean = sum / field.length;
  let variance = 0;
  for (let k = 0; k < field.length; k += 1) variance += (field[k] - mean) ** 2;
  const std = Math.sqrt(variance / field.length) || 1;

  const base = [1, 3, 5].map((c) => toLinear(parseInt(pattern.hex.slice(c, c + 2), 16) / 255));
  const contrast = Math.min(0.45, Math.max(0.04, pattern.contrast));
  /* Линейное → sRGB байт — таблицей: три степени на пиксель стоили бы секунды. */
  const SRGB = 4096;
  const srgbTable = new Uint8ClampedArray(SRGB + 1);
  for (let k = 0; k <= SRGB; k += 1) srgbTable[k] = Math.round(toSrgb(k / SRGB) * 255);
  /* Тёмные места дерева чуть теплее и насыщеннее — поздний слой краснее раннего; таблицей по тёмности. */
  const WARM = 1024;
  const WARM_MAX = 6;
  const warmG = new Float32Array(WARM + 1);
  const warmB = new Float32Array(WARM + 1);
  for (let k = 0; k <= WARM; k += 1) {
    const t = (k / WARM) * WARM_MAX;
    warmG[k] = Math.exp(Math.log(0.93) * contrast * 1.6 * t);
    warmB[k] = Math.exp(Math.log(0.84) * contrast * 1.6 * t);
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const byte = (x: number) => srgbTable[((x < 0 ? 0 : x > 1 ? 1 : x) * SRGB + 0.5) | 0];
  for (let k = 0; k < field.length; k += 1) {
    const t = (field[k] - mean) / std;
    const f = 1 - contrast * t;
    const wi = t > 0 ? ((Math.min(t, WARM_MAX) / WARM_MAX) * WARM) | 0 : 0;
    const o = k * 4;
    out[o] = byte(base[0] * f);
    out[o + 1] = byte(base[1] * f * (t > 0 ? warmG[wi] : 1));
    out[o + 2] = byte(base[2] * f * (t > 0 ? warmB[wi] : 1));
    out[o + 3] = 255;
  }
  return out;
}
