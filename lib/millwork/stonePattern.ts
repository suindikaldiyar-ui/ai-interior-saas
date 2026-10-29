/**
 * ДЕМОНСТРАЦИОННЫЙ РИСУНОК КАМНЯ (STAGE B) — СВОЙ, А НЕ ОБРАЗЕЦ ПОСТАВЩИКА.
 *
 * Панель «под камень» — МДФ в плёнке с рисунком камня. Плёнку выбирают по
 * каталогу поставщика, а его образцов у нас нет: в 3D камень рисуется нашим
 * кодом — спокойный фон и тонкие прожилки в цвет панели. Это ДЕМОНСТРАЦИЯ и так
 * называется (`STONE_STATUS`): рисунок условный, от выбора в нём только цвет.
 *
 * Плитка бесшовная: шум задан на решётке, свёрнутой по краям, а прожилки —
 * синус с целыми частотами по обеим осям, поэтому повтор не даёт шва.
 * Здесь — адрес рисунка и пиксели; текстуру из них делает `textureCache`.
 */

export type StonePattern = {
  /** Цвет фона, sRGB `#rrggbb`. */
  hex: string;
  /** Зерно случайностей: у одного цвета всегда один рисунок. */
  seed: string;
};

export const STONE_STATUS = 'демонстрационный рисунок камня, не образец плёнки поставщика';

/** Плитка рисунка — 1200 × 1200 мм, 512 × 512 пикселей: прожилки читаются с общего плана. */
export const STONE_TILE_MM: [number, number] = [1200, 1200];
export const STONE_TILE_PX: [number, number] = [512, 512];

const HEX = /^#[0-9a-f]{6}$/i;

export function stonePatternOf(hex: string | null | undefined): StonePattern | null {
  if (!hex || !HEX.test(hex)) return null;
  const color = hex.toLowerCase();
  return { hex: color, seed: `stone:${color}` };
}

export function stonePatternUrl(pattern: StonePattern): string {
  const q = new URLSearchParams({ hex: pattern.hex.slice(1), seed: pattern.seed });
  return `procedural:stone?${q.toString()}`;
}

export function stonePatternFromUrl(url: string): StonePattern | null {
  if (!url.startsWith('procedural:stone?')) return null;
  const q = new URLSearchParams(url.slice('procedural:stone?'.length));
  const hex = `#${q.get('hex') ?? ''}`;
  if (!HEX.test(hex)) return null;
  return { hex: hex.toLowerCase(), seed: q.get('seed') ?? '' };
}

/** Строка в число зерна (FNV-1a). */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Случайное число узла решётки, 0…1: одно и то же у одного узла и зерна. */
function lattice(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Шум на решётке с периодом `period` узлов: края плитки сходятся. */
function periodicNoise(seed: number, x: number, y: number, period: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number) => ((v % period) + period) % period;
  const a = lattice(seed, wrap(x0), wrap(y0));
  const b = lattice(seed, wrap(x0 + 1), wrap(y0));
  const c = lattice(seed, wrap(x0), wrap(y0 + 1));
  const d = lattice(seed, wrap(x0 + 1), wrap(y0 + 1));
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Пиксели плитки RGBA: фон с мягким разнотоном и тонкие прожилки. */
export function stonePixels(pattern: StonePattern, width: number, height: number): Uint8ClampedArray {
  const seed = seedOf(pattern.seed);
  const base = [1, 3, 5].map((i) => parseInt(pattern.hex.slice(i, i + 2), 16));
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;
      let n = 0;
      let amp = 0.5;
      let period = 4;
      for (let o = 0; o < 5; o += 1) {
        n += amp * periodicNoise(seed + o * 7919, u * period, v * period, period);
        period *= 2;
        amp *= 0.5;
      }
      /* Прожилки: целые частоты по u и v — повтор без шва. */
      const wave = Math.abs(Math.sin(2 * Math.PI * (2 * u + v) + 7 * n));
      const vein = Math.pow(1 - wave, 10);
      const fine = Math.pow(1 - Math.abs(Math.sin(2 * Math.PI * (u - 3 * v) + 11 * n)), 24) * 0.5;
      const shade = 0.94 + 0.12 * (n - 0.5);
      const dark = Math.min(0.55, 0.42 * vein + 0.22 * fine);
      const at = (y * width + x) * 4;
      for (let k = 0; k < 3; k += 1) out[at + k] = Math.round(base[k] * shade * (1 - dark) + 40 * dark);
      out[at + 3] = 255;
    }
  }
  return out;
}
