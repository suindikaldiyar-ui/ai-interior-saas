import type { ApplianceKind, Module, ModuleKind } from '@/types/millwork';

/**
 * Отраслевые стандарты корпусной мебели.
 *
 * Из интерфейса эти величины НЕ меняются. Дизайнер не должен иметь
 * возможности сделать столешницу на высоте 1.1 м: на этих числах держится
 * эргономика, а ошибка вылезет уже на монтаже.
 */

/** Стандартные ширины фасадов, мм. По возрастанию. */
export const STANDARD_WIDTHS = [
  150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000, 1200,
] as const;

export const MIN_WIDTH = STANDARD_WIDTHS[0];
export const MAX_WIDTH = STANDARD_WIDTHS[STANDARD_WIDTHS.length - 1];

export const GEOMETRY = {
  base: {
    carcassH: 720,
    plinthH: 100,
    depth: 560,
    frontDepth: 18,
    countertopDepth: 600,
    countertopH: 38,
  },
  upper: {
    carcassH: 720,
    tallH: 920,
    depth: 320,
    bottomFromFloor: 1450,
  },
  tall: {
    depth: 560,
    heights: [2100, 2300, 2400],
  },
  gapToWall: 10,
  gapBetweenModules: 3,
} as const;

/** Полная высота нижнего ряда со столешницей. */
export const BASE_TOTAL_H =
  GEOMETRY.base.plinthH + GEOMETRY.base.carcassH + GEOMETRY.base.countertopH; // 858

export type ApplianceSpec = {
  widthMm: number;
  kind: ModuleKind;
  /** Что должно быть подведено к модулю. */
  needs: ('water' | 'sewer' | 'socket' | 'vent' | 'gas')[];
  /** Высота ниши под встройку, если она задана жёстко. */
  nicheHMm?: number;
  title: string;
};

export const APPLIANCE_SLOTS: Record<ApplianceKind, ApplianceSpec> = {
  oven: { widthMm: 600, kind: 'tall', needs: ['socket'], nicheHMm: 595, title: 'Духовой шкаф' },
  hob: { widthMm: 600, kind: 'base', needs: ['socket'], title: 'Варочная панель' },
  hood: { widthMm: 600, kind: 'upper', needs: ['socket', 'vent'], title: 'Вытяжка' },
  dishwasher45: { widthMm: 450, kind: 'base', needs: ['water', 'sewer', 'socket'], title: 'Посудомойка 45' },
  dishwasher60: { widthMm: 600, kind: 'base', needs: ['water', 'sewer', 'socket'], title: 'Посудомойка 60' },
  sink600: { widthMm: 600, kind: 'base', needs: ['water', 'sewer'], title: 'Мойка 600' },
  sink800: { widthMm: 800, kind: 'base', needs: ['water', 'sewer'], title: 'Мойка 800' },
  fridge: { widthMm: 600, kind: 'tall', needs: ['socket'], title: 'Холодильник' },
  /*
   * Микроволновка встраивается в ПЕНАЛ, а не висит над столешницей: так её
   * ставят в колонну с духовкой, и так она попадает в ряд одним модулем.
   * Ниша по стандарту 380–450 мм, берём середину.
   */
  microwave: { widthMm: 600, kind: 'tall', needs: ['socket'], nicheHMm: 400, title: 'Микроволновка' },
};

/* ─────────────────────  Колонна из двух приборов  ───────────────────── */

/**
 * Духовка и микроволновка в одном пенале.
 *
 * Самое частое, чего конфигуратор не умел: мебельщик ставит два прибора
 * друг над другом почти в каждый заказ. Числа отраслевые и из интерфейса
 * не меняются — это те же стандарты, что ширины фасадов.
 */
export const APPLIANCE_COLUMN = {
  widthMm: 600,
  /** Приборы начинаются на этой высоте от дна: духовка на уровне груди. */
  baseMm: 700,
  /** Ниша микроволновки: стандарт 380–450 мм. */
  microwaveNicheMm: [380, 450] as const,
  /** Ниже этой высоты два прибора друг над другом не собираются. */
  minHeightMm: 1400,
  /** Полка между нишами — она же дно верхнего прибора. */
  shelfMm: 16,
} as const;

/** Высота ниши прибора: духовка 595, микроволновка 400. */
export function nicheHeightMm(appliance: ApplianceKind): number {
  return APPLIANCE_SLOTS[appliance].nicheHMm ?? 0;
}

/**
 * Какие приборы стоят в модуле. У колонны их два, и потерять второй
 * нельзя: в смете это духовка без микроволновки, за которую заплатили.
 */
export function moduleAppliances(unit: Pick<Module, 'appliance' | 'column'>): ApplianceKind[] {
  if (unit.column) {
    return [unit.column.bottom as ApplianceKind, unit.column.top as ApplianceKind];
  }
  return unit.appliance ? [unit.appliance] : [];
}

/**
 * Створок на фасаде встроенного холодильника: дверь холодильной камеры
 * и дверь морозильной. Это то, что цех делает на самом деле.
 */
export const BUILT_IN_FRIDGE_FRONTS = 2;

/** Допуск на попадание мойки в точку водоснабжения. */
export const WATER_TOLERANCE_MM = 600;

/** Угловой модуль — всегда 900 × 900, это стандарт под карусель. */
export const CORNER_SIZE_MM = 900;

/**
 * СТЫК ДВУХ РЯДОВ.
 *
 * Числа отраслевые и из интерфейса не меняются — то же правило, что
 * у системы 32 и у GEOMETRY. Компания их подтверждает, а не настраивает:
 * фасад, упирающийся в перпендикулярный, — это переделка на объекте,
 * а не вопрос вкуса.
 */
export const CORNER = {
  /** Фальш-панель между рядами: отодвигает фасад от чужого фасада. */
  falsePanelMm: 100,
  /** Угол раскрытия угловой петли. 175° дороже, но открывается полностью. */
  hingeAngleDeg: 175 as 155 | 175,
  /** Зазор фасада у угла: 12 мм вместо обычных 3–4. */
  frontGapMm: 12,
  /** Проход между параллельными рядами П-образной кухни. */
  minAisleMm: 1200,
} as const;

/* ─────────────────────────  Фасады  ───────────────────────── */

/**
 * Число дверей и ящиков от ширины и типа модуля. Таблица фиксирована:
 * это то, что цех умеет делать, а не свободный параметр.
 */
export function frontPlan(
  kind: ModuleKind,
  widthMm: number,
  drawersRequested?: number,
): { doorCount: number; drawerCount: number } {
  if (kind === 'filler') return { doorCount: 0, drawerCount: 0 };

  if (drawersRequested !== undefined && drawersRequested > 0) {
    return { doorCount: 0, drawerCount: Math.min(5, Math.max(1, Math.round(drawersRequested))) };
  }

  // Шире 600 мм одна дверь провисает на петлях — ставим две.
  const doorCount = widthMm > 600 ? 2 : 1;
  return { doorCount, drawerCount: 0 };
}

/** Петель на дверь: от высоты полотна. */
export function hingesPerDoor(doorHeightMm: number): number {
  return doorHeightMm > 1200 ? 3 : 2;
}

export function isStandardWidth(widthMm: number): boolean {
  return (STANDARD_WIDTHS as readonly number[]).includes(widthMm);
}

/** Наибольший стандарт, не превышающий заданную ширину. */
export function largestStandardUpTo(widthMm: number): number | null {
  let best: number | null = null;
  for (const w of STANDARD_WIDTHS) {
    if (w <= widthMm) best = w;
  }
  return best;
}

/** Ближайший стандарт — для посадки произвольной ширины из команды. */
export function snapToStandard(widthMm: number): number {
  let best: number = STANDARD_WIDTHS[0];
  let bestDistance = Math.abs(widthMm - best);
  for (const w of STANDARD_WIDTHS) {
    const distance = Math.abs(widthMm - w);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = w;
    }
  }
  return best;
}

/** Высота модуля по типу — нужна и чертежу, и расчёту кромки. */
export function moduleHeightMm(kind: ModuleKind, options?: { upperToCeiling?: boolean; ceilingHeightMm?: number }): number {
  switch (kind) {
    case 'base':
    case 'corner_base':
    case 'filler':
      return GEOMETRY.base.carcassH;
    case 'upper':
    case 'corner_upper':
      if (options?.upperToCeiling && options.ceilingHeightMm) {
        return Math.max(
          GEOMETRY.upper.carcassH,
          options.ceilingHeightMm - GEOMETRY.upper.bottomFromFloor,
        );
      }
      return GEOMETRY.upper.carcassH;
    case 'tall':
      return GEOMETRY.tall.heights[1];
    default:
      return GEOMETRY.base.carcassH;
  }
}

export function moduleDepthMm(kind: ModuleKind): number {
  if (kind === 'upper' || kind === 'corner_upper') return GEOMETRY.upper.depth;
  if (kind === 'tall') return GEOMETRY.tall.depth;
  return GEOMETRY.base.depth;
}
