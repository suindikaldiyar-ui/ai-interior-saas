import type { FrontType, ModuleKind, SectionKind } from '@/types/millwork';

/**
 * ОТРАСЛЕВЫЕ СТАНДАРТЫ СЕКЦИЙ.
 *
 * То же правило, что и у кухни: из интерфейса эти числа не меняются.
 * Штанга под пальто требует 1500 мм чистой высоты, полки идут шагом 350 мм,
 * одна дверь-купе шире 1200 мм провисает. Это не наши предпочтения, а то,
 * что цех умеет делать и что не развалится через год.
 */

export type SectionSpec = {
  kind: SectionKind;
  title: string;
  /** Каким модулем секция становится в ряду. */
  moduleKind: ModuleKind;
  frontType: FrontType;
  drawerCount: number;
  /** Ширины: от, до и та, с которой начинаем раскладку. */
  minWidthMm: number;
  maxWidthMm: number;
  preferredWidthMm: number;
  /** Полезная высота секции, мм. Ноль — считается от высоты ряда. */
  heightMm: number;
  /** Что уходит в смету сверх корпуса. */
  hint: string;
};

export const SECTION_SPECS: Record<SectionKind, SectionSpec> = {
  /* ── Спальня ── */
  hanging_long: {
    kind: 'hanging_long',
    title: 'Штанга под длинное',
    moduleKind: 'tall',
    frontType: 'door',
    drawerCount: 0,
    minWidthMm: 600,
    maxWidthMm: 1200,
    preferredWidthMm: 900,
    // Пальто и платья: 1500 мм чистой высоты под штангой.
    heightMm: 1500,
    hint: 'пальто, платья, чехлы',
  },
  hanging_double: {
    kind: 'hanging_double',
    title: 'Две штанги',
    moduleKind: 'tall',
    frontType: 'door',
    drawerCount: 0,
    minWidthMm: 600,
    maxWidthMm: 1200,
    preferredWidthMm: 900,
    // 1000 сверху + 900 снизу: рубашки и брюки в два яруса.
    heightMm: 1900,
    hint: 'рубашки, брюки в два яруса',
  },
  shelves: {
    kind: 'shelves',
    title: 'Полки',
    moduleKind: 'tall',
    frontType: 'door',
    drawerCount: 0,
    minWidthMm: 400,
    maxWidthMm: 900,
    preferredWidthMm: 600,
    heightMm: 0,
    hint: 'шаг полок 350 мм',
  },
  drawers: {
    kind: 'drawers',
    title: 'Блок ящиков',
    moduleKind: 'base',
    frontType: 'drawers',
    drawerCount: 4,
    minWidthMm: 400,
    maxWidthMm: 800,
    preferredWidthMm: 600,
    heightMm: 800,
    hint: 'бельё, мелочи',
  },
  open: {
    kind: 'open',
    title: 'Открытая секция',
    moduleKind: 'tall',
    frontType: 'none',
    drawerCount: 0,
    minWidthMm: 300,
    maxWidthMm: 900,
    preferredWidthMm: 450,
    heightMm: 0,
    hint: 'сумки, короба, подсветка',
  },
  mezzanine: {
    kind: 'mezzanine',
    title: 'Антресоль',
    moduleKind: 'upper',
    frontType: 'door',
    drawerCount: 0,
    minWidthMm: 400,
    maxWidthMm: 1000,
    preferredWidthMm: 800,
    heightMm: 500,
    hint: 'сезонное хранение',
  },

  /* ── Прихожая ── */
  hooks: {
    kind: 'hooks',
    title: 'Открытая вешалка',
    moduleKind: 'tall',
    frontType: 'none',
    drawerCount: 0,
    minWidthMm: 400,
    maxWidthMm: 1000,
    preferredWidthMm: 800,
    // Куртка на крючке: 1600–1800 мм.
    heightMm: 1700,
    hint: 'крючки, ежедневная одежда',
  },
  shoes: {
    kind: 'shoes',
    title: 'Обувница',
    moduleKind: 'base',
    frontType: 'door',
    drawerCount: 0,
    minWidthMm: 400,
    maxWidthMm: 900,
    preferredWidthMm: 600,
    // Три-четыре наклонных яруса.
    heightMm: 900,
    hint: '3–4 наклонных яруса',
  },
  bench: {
    kind: 'bench',
    title: 'Скамья',
    moduleKind: 'base',
    frontType: 'none',
    drawerCount: 0,
    minWidthMm: 400,
    maxWidthMm: 1000,
    preferredWidthMm: 600,
    heightMm: 450,
    hint: 'мягкое сиденье, обуться сидя',
  },
  mirror: {
    kind: 'mirror',
    title: 'Зеркало',
    moduleKind: 'tall',
    frontType: 'none',
    drawerCount: 0,
    minWidthMm: 400,
    maxWidthMm: 600,
    preferredWidthMm: 400,
    heightMm: 1400,
    hint: 'в рост или 400 × 1400',
  },

  /* ── Зал ── */
  tv_niche: {
    kind: 'tv_niche',
    title: 'Ниша под ТВ',
    moduleKind: 'upper',
    frontType: 'none',
    drawerCount: 0,
    // Диагональ 55" это 1220 мм плюс запас по 100 с каждой стороны.
    minWidthMm: 1000,
    maxWidthMm: 1600,
    preferredWidthMm: 1400,
    heightMm: 700,
    hint: 'кабель-канал и подсветка обязательны',
  },
  hanging_module: {
    kind: 'hanging_module',
    title: 'Подвесной модуль',
    moduleKind: 'upper',
    frontType: 'door',
    drawerCount: 0,
    minWidthMm: 400,
    maxWidthMm: 1000,
    preferredWidthMm: 600,
    heightMm: 400,
    hint: 'висит на стене, опор нет',
  },

  /* ── Санузел ── */
  vanity: {
    kind: 'vanity',
    title: 'Тумба под раковину',
    moduleKind: 'base',
    frontType: 'door',
    drawerCount: 0,
    minWidthMm: 500,
    maxWidthMm: 1000,
    preferredWidthMm: 700,
    // 850 мм со столешницей — стандартная высота под раковину.
    heightMm: 850,
    hint: 'вырез под раковину, привязка к воде',
  },
  tall_unit: {
    kind: 'tall_unit',
    title: 'Пенал',
    moduleKind: 'tall',
    frontType: 'door',
    drawerCount: 0,
    minWidthMm: 300,
    maxWidthMm: 450,
    preferredWidthMm: 350,
    heightMm: 2000,
    hint: 'бытовая химия, полотенца',
  },
  mirror_cabinet: {
    kind: 'mirror_cabinet',
    title: 'Зеркальный шкаф',
    moduleKind: 'upper',
    frontType: 'door',
    drawerCount: 0,
    minWidthMm: 500,
    maxWidthMm: 900,
    preferredWidthMm: 700,
    heightMm: 700,
    hint: 'глубина 150 мм, с подсветкой',
  },
};

/** Двери-купе: шире 1200 мм полотно провисает, уже 600 мм неудобно. */
export const SLIDING_DOOR = {
  minWidthMm: 600,
  maxWidthMm: 1200,
  /** Нахлёст полотен друг на друга. */
  overlapMm: 50,
} as const;

/** Сколько полотен нужно на ряд такой длины. */
export function slidingDoorCount(lengthMm: number): number {
  if (lengthMm <= 0) return 0;
  return Math.max(2, Math.ceil(lengthMm / SLIDING_DOOR.maxWidthMm));
}

export function sectionSpec(kind: SectionKind): SectionSpec {
  return SECTION_SPECS[kind];
}
