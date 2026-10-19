/**
 * ДЕМОНСТРАЦИОННЫЙ РИСУНОК ДЕРЕВА — СВОЙ, А НЕ ТЕКСТУРА ДЕКОРА.
 *
 * Права на изображения декоров EGGER не подтверждены, официальные файлы
 * декоров — в myEGGER за входом. Поэтому дерево ЛДСП в 3D рисуется нашим
 * кодом: годичные кольца, лёгкие «соборные» дуги, поры вдоль волокна и
 * разнотон плашек. Это ДЕМОНСТРАЦИЯ: рисунок условный и так и называется.
 * От декора в нём ровно одно — ЦВЕТ: средний цвет образца декора, тот же,
 * что красит позицию везде. Контраст и шаг колец — общие для всех декоров
 * (`DEMO_WOOD`): кропы брошюр — 0.6 пикс/мм, кольцо в 3–5 мм там размыто
 * в пиксель-два, и «замер» с них выдал бы размытие за характер декора.
 *
 * Артикул позиции остаётся своим — рисунок не выдаётся за её текстуру.
 *
 * Плитка БЕСШОВНАЯ: шум задаётся на решётке, свёрнутой по краям плитки,
 * поэтому повтор не даёт ни шва, ни зеркала. Волокно идёт ВДОЛЬ v (вниз
 * по картинке) — так его кладёт развёртка граней по правилу раскроя.
 *
 * Здесь — решение «чем рисовать» и адрес рисунка; пиксели считает
 * `woodPixels.ts` (по требованию: фоновый поток сцены, образец в панели).
 */

/** Параметры рисунка. Всё, что меняет картинку, — здесь. */
export type WoodPattern = {
  /** Средний цвет, sRGB `#rrggbb`. */
  hex: string;
  /** Зерно случайностей: у одного декора всегда один рисунок. */
  seed: string;
  /** Разброс светлоты (коэффициент вариации линейной яркости), 0.04…0.45. */
  contrast: number;
  /** Шаг колец поперёк волокна, мм. */
  ringMm: number;
};

/**
 * РАЗМЕР ПЛИТКИ РИСУНКА — 800 × 1600 мм.
 *
 * Поперёк волокна 800: дверь шкафа 450–600 мм целиком внутри одного
 * повтора (при 400 мм дверь 450 видела рисунок дважды со сдвигом 50 мм —
 * повтор ловился глазом). Вдоль 1600: дверь 2 м видит рисунок 1.25 раза,
 * а не пять. Пикселей 2048 × 2048: 2.56 пикс/мм поперёк волокна — кольцо в
 * 3 мм это восемь пикселей, — 1.28 вдоль: вдоль волокна рисунок тянется.
 */
export const WOOD_TILE_MM: [number, number] = [800, 1600];
export const WOOD_TILE_PX: [number, number] = [2048, 2048];

const HEX = /^#[0-9a-f]{6}$/i;

/* ─────────────────────────  какой декор — дерево  ───────────────────────── */

/**
 * ДЕРЕВО ЛИ ЭТО — по коду декора EGGER.
 *
 * H — дерево (Holz), U и W — однотон, F — камень, бетон, металл, текстиль.
 * Однотон рисунка не получает вовсе: белое ЛДСП W1000 — ровный белый, и
 * подрисованные «волокна» там были бы враньём. Камень и прочее — тоже
 * без рисунка: демонстрационный рисунок здесь только дерева.
 */
export function isWoodDecor(decorCode: string | null | undefined): boolean {
  return /^H\d/i.test((decorCode ?? '').trim());
}

/**
 * ОБЩИЕ ЧИСЛА ДЕМОНСТРАЦИОННОГО ДЕРЕВА — не замер декора, а выбор рисунка:
 * спокойная древесина, кольцо 4 мм. Одни на все декоры; разные декоры
 * различаются цветом и зерном случайностей (свой рисунок у каждого кода).
 */
export const DEMO_WOOD = { contrast: 0.16, ringMm: 4 } as const;

/** Рисунок декора-дерева: его цвет и общие числа демонстрации. Не дерево — `null`. */
export function woodPatternOf(input: {
  decorCode: string | null | undefined;
  surfaceCode?: string | null;
  hex: string | null | undefined;
}): WoodPattern | null {
  if (!isWoodDecor(input.decorCode) || !input.hex || !HEX.test(input.hex)) return null;
  return {
    hex: input.hex.toLowerCase(),
    seed: `${input.decorCode}:${input.surfaceCode ?? ''}`,
    contrast: DEMO_WOOD.contrast,
    ringMm: DEMO_WOOD.ringMm,
  };
}

/** Рисунок — в строку адреса: кэш текстуры по ней, и сцена узнаёт рисунок, а не файл. */
export function woodPatternUrl(pattern: WoodPattern): string {
  const q = new URLSearchParams({
    hex: pattern.hex.slice(1),
    seed: pattern.seed,
    contrast: pattern.contrast.toFixed(3),
    ring: pattern.ringMm.toFixed(2),
  });
  return `procedural:wood?${q.toString()}`;
}

/** Обратно: адрес — в рисунок; чужой адрес — `null`. */
export function woodPatternFromUrl(url: string): WoodPattern | null {
  if (!url.startsWith('procedural:wood?')) return null;
  const q = new URLSearchParams(url.slice('procedural:wood?'.length));
  const hex = `#${q.get('hex') ?? ''}`;
  const contrast = Number(q.get('contrast'));
  const ringMm = Number(q.get('ring'));
  if (!HEX.test(hex) || !Number.isFinite(contrast) || !Number.isFinite(ringMm)) return null;
  return { hex, seed: q.get('seed') ?? '', contrast, ringMm };
}
