import type { Dimensions, FurnitureItem, RoomConfig, WallSide } from '@/types/interior';

/**
 * Кухонный гарнитур — первая категория с applies_to='zone'.
 *
 * Устроена принципиально иначе, чем диван: это не предмет с фиксированным
 * габаритом, а линейная конфигурация вдоль стены. Длину определяет комната,
 * цену — погонные метры. По этому же шаблону дальше лягут шкафы-купе,
 * гардеробные и кухонные острова.
 *
 * Здесь только чистые функции: их можно прогнать тестом без браузера,
 * а разбивка на модули обязана быть детерминированной — иначе 3D и рендер
 * покажут клиенту две разные кухни.
 */

/* ─────────────────────────  Отраслевые стандарты  ───────────────────────── */

/**
 * Фиксированные величины. На них завязана эргономика, поэтому они НЕ
 * параметризуются в интерфейсе: дизайнер не должен иметь возможности
 * сделать столешницу на высоте 1.1 м.
 */
export const KITCHEN = {
  /** Высота нижнего ряда вместе со столешницей. */
  baseHeight: 0.85,
  baseDepth: 0.6,
  plinthHeight: 0.1,
  /** Цоколь утоплен вглубь относительно фасада. */
  plinthInset: 0.05,
  counterThickness: 0.04,
  counterOverhang: 0.02,
  upperBottomY: 1.45,
  upperHeight: 0.72,
  upperDepth: 0.35,
  fridgeHeight: 2.0,
  /** Шов между корпусами. */
  gap: 0.003,
  facadeThickness: 0.018,
} as const;

/** Высота фартука — производная, а не отдельная настройка. */
export const APRON_HEIGHT = KITCHEN.upperBottomY - KITCHEN.baseHeight; // 0.60

/* ─────────────────────────  Параметры гарнитура  ───────────────────────── */

export type KitchenLayout = 'linear' | 'corner_l' | 'u_shape';
export type Appliance = 'fridge' | 'oven' | 'hob' | 'sink' | 'dishwasher';
export type HandleType = 'profile' | 'rail' | 'none';

export type KitchenMeta = {
  layout: KitchenLayout;
  /** Длина второго ряда для corner_l и u_shape, м. */
  secondaryLength: number;
  side: 'left' | 'right';
  hasUpper: boolean;
  upperBottomY: number;
  appliances: Appliance[];
  handleType: HandleType;
  /** Усреднённый цвет фасада из композита — чтобы в 3D было видно тон. */
  facadeColor?: string;
  counterColor?: string;
  apronColor?: string;
};

const LAYOUTS: KitchenLayout[] = ['linear', 'corner_l', 'u_shape'];
const APPLIANCES: Appliance[] = ['fridge', 'oven', 'hob', 'sink', 'dishwasher'];
const HANDLES: HandleType[] = ['profile', 'rail', 'none'];

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Приводит meta любого происхождения (AI, каталог, импорт) к рабочему виду. */
export function readKitchenMeta(meta: Record<string, unknown> | undefined): KitchenMeta {
  const raw = meta ?? {};
  const layout = LAYOUTS.includes(raw.layout as KitchenLayout)
    ? (raw.layout as KitchenLayout)
    : 'linear';

  const appliances: Appliance[] = Array.isArray(raw.appliances)
    ? (raw.appliances as unknown[]).filter((a): a is Appliance =>
        APPLIANCES.includes(a as Appliance),
      )
    : ['sink', 'hob', 'fridge'];

  return {
    layout,
    secondaryLength: Math.max(0, num(raw.secondaryLength, layout === 'linear' ? 0 : 1.8)),
    side: raw.side === 'right' ? 'right' : 'left',
    hasUpper: raw.hasUpper === undefined ? true : Boolean(raw.hasUpper),
    upperBottomY: num(raw.upperBottomY, KITCHEN.upperBottomY),
    appliances: appliances.length > 0 ? appliances : ['sink', 'hob'],
    handleType: HANDLES.includes(raw.handleType as HandleType)
      ? (raw.handleType as HandleType)
      : 'profile',
    facadeColor: typeof raw.facadeColor === 'string' ? raw.facadeColor : undefined,
    counterColor: typeof raw.counterColor === 'string' ? raw.counterColor : undefined,
    apronColor: typeof raw.apronColor === 'string' ? raw.apronColor : undefined,
  };
}

/* ─────────────────────────  Разбивка на модули  ───────────────────────── */

/** Стандартные ширины фасадов, мм. Порядок по убыванию — он же приоритет. */
const STANDARD_MM = [900, 800, 600, 500, 450, 400, 300];
const BASE_MM = 600;
const MIN_MODULE_MM = 100;

/** Остаток закрываем стандартами: сначала одним, потом парой, иначе добором. */
function fitRemainder(remainderMm: number): number[] {
  if (remainderMm <= 0) return [];
  if (STANDARD_MM.includes(remainderMm)) return [remainderMm];

  // Пара стандартов, дающая точную сумму. Перебор по убыванию — результат
  // не зависит от порядка вызова, разбивка остаётся детерминированной.
  for (const a of STANDARD_MM) {
    for (const b of STANDARD_MM) {
      if (a >= b && a + b === remainderMm) return [a, b];
    }
  }

  const fit = STANDARD_MM.find((w) => w <= remainderMm);
  if (fit === undefined) return [remainderMm];

  const leftover = remainderMm - fit;
  return leftover >= MIN_MODULE_MM ? [fit, leftover] : [remainderMm];
}

/**
 * Длина ряда → ширины модулей, слева направо.
 *
 * Жадный алгоритм: заполняем базовыми 600, остаток закрываем стандартом.
 * Функция чистая и целочисленная (миллиметры) — одна и та же длина всегда
 * даёт одни и те же модули, даже после сериализации через JSON.
 */
export function splitIntoModules(lengthM: number): number[] {
  const total = Math.round(num(lengthM, 0) * 1000);
  if (total < MIN_MODULE_MM) return [];
  if (total < 300) return [total / 1000];

  let count = Math.floor(total / BASE_MM);
  let remainder = total - count * BASE_MM;

  // Огрызок меньше самого узкого стандарта — забираем базовый модуль обратно
  // и раскладываем 600 + остаток заново.
  if (remainder > 0 && remainder < 300 && count > 0) {
    count -= 1;
    remainder += BASE_MM;
  }

  const modules: number[] = new Array(count).fill(BASE_MM);
  modules.push(...fitRemainder(remainder));

  return modules.map((mm) => mm / 1000);
}

/* ─────────────────────────  Расстановка техники  ───────────────────────── */

export type ModuleRole = 'plain' | 'fridge' | 'sink' | 'hob' | 'dishwasher' | 'tall';

export type KitchenModule = {
  width: number;
  /** Высота пенала в метрах. Для нижних модулей не задаётся. */
  heightM?: number;
  /** Локальная X центра модуля внутри ряда, отсчёт от середины ряда. */
  centerX: number;
  role: ModuleRole;
  /** Духовой шкаф встраивается в тот же модуль, что и варочная панель. */
  hasOven: boolean;
  /** Ящики вместо дверцы. */
  drawers: boolean;
};

/** Индекс модуля, ближайшего к доле длины ряда, среди свободных. */
function nearestFree(
  modules: { width: number; centerX: number }[],
  taken: Set<number>,
  fraction: number,
  totalLength: number,
): number {
  const targetX = -totalLength / 2 + totalLength * fraction;
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < modules.length; i++) {
    if (taken.has(i)) continue;
    const distance = Math.abs(modules[i].centerX - targetX);
    // При равном расстоянии берём меньший индекс — детерминированность.
    if (distance < bestDistance - 1e-9) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Раскладка техники по модулям ряда. Полностью детерминирована:
 * холодильник с краю, мойка примерно на трети, плита — на двух третях.
 */
export function planModules(lengthM: number, meta: KitchenMeta): KitchenModule[] {
  const widths = splitIntoModules(lengthM);
  if (widths.length === 0) return [];

  const total = widths.reduce((sum, w) => sum + w, 0);
  let cursor = -total / 2;
  const base = widths.map((width) => {
    const centerX = cursor + width / 2;
    cursor += width;
    return { width, centerX };
  });

  const roles: ModuleRole[] = new Array(widths.length).fill('plain');
  const taken = new Set<number>();
  const has = (a: Appliance) => meta.appliances.includes(a);

  // Холодильник — в торце ряда, не в середине.
  if (has('fridge')) {
    const index = meta.side === 'right' ? base.length - 1 : 0;
    roles[index] = 'fridge';
    taken.add(index);
  }

  let sinkIndex = -1;
  if (has('sink')) {
    sinkIndex = nearestFree(base, taken, 0.35, total);
    if (sinkIndex >= 0) {
      roles[sinkIndex] = 'sink';
      taken.add(sinkIndex);
    }
  }

  let hobIndex = -1;
  if (has('hob')) {
    hobIndex = nearestFree(base, taken, 0.7, total);
    if (hobIndex >= 0) {
      roles[hobIndex] = 'hob';
      taken.add(hobIndex);
    }
  }

  if (has('dishwasher') && sinkIndex >= 0) {
    const neighbour = [sinkIndex + 1, sinkIndex - 1].find(
      (i) => i >= 0 && i < base.length && !taken.has(i),
    );
    if (neighbour !== undefined) {
      roles[neighbour] = 'dishwasher';
      taken.add(neighbour);
    }
  }

  return base.map((module, i) => ({
    ...module,
    role: roles[i],
    hasOven: has('oven') && i === hobIndex,
    // Ящики через один — детерминированный шаг, без случайности.
    drawers: roles[i] === 'plain' && i % 2 === 1,
  }));
}

/* ─────────────────────────  Габаритный бокс  ───────────────────────── */

/** Длина второго ряда без участка, занятого первым: в углу не должно быть наложения. */
export function secondaryRunLength(meta: KitchenMeta): number {
  if (meta.layout === 'linear') return 0;
  return Math.max(0, meta.secondaryLength - KITCHEN.baseDepth);
}

/**
 * Габаритный бокс обязан охватывать ВСЕ ряды, иначе clampToRoom выпустит
 * гарнитур за стену: он считает по dimensions, а не по геометрии меша.
 */
export function kitchenFootprint(dimensions: Dimensions, meta: KitchenMeta): Dimensions {
  const depth =
    meta.layout === 'linear'
      ? KITCHEN.baseDepth
      : Math.max(KITCHEN.baseDepth, meta.secondaryLength);

  const height = meta.appliances.includes('fridge')
    ? Math.max(KITCHEN.fridgeHeight, dimensions.height)
    : Math.max(meta.upperBottomY + KITCHEN.upperHeight, KITCHEN.baseHeight);

  return {
    width: Math.max(0.3, dimensions.width),
    height: Math.round(height * 100) / 100,
    depth: Math.round(depth * 100) / 100,
  };
}

/** Общая длина в погонных метрах — по ней считается смета. */
export function runningMeters(dimensions: Dimensions, meta: KitchenMeta): number {
  const primary = Math.max(0, dimensions.width);
  const secondary = secondaryRunLength(meta);
  const total =
    meta.layout === 'u_shape' ? primary + secondary * 2 : primary + secondary;
  return Math.round(total * 100) / 100;
}

/* ─────────────────────────  Верхний ряд и окна  ───────────────────────── */

type Interval = [number, number];

/** Мировая точка из локальной координаты ряда. */
function toWorld(
  item: Pick<FurnitureItem, 'position' | 'rotation'>,
  localX: number,
  localZ: number,
): { x: number; z: number } {
  const angle = (item.rotation.y * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: item.position.x + localX * cos + localZ * sin,
    z: item.position.z - localX * sin + localZ * cos,
  };
}

/** Попадает ли точка в «тень» окна на своей стене. */
function blockedByWindow(
  point: { x: number; z: number },
  room: RoomConfig,
  topY: number,
  bottomY: number,
): boolean {
  const nearWall = 0.75;

  for (const win of room.windows ?? []) {
    // Вертикального пересечения нет — шкаф спокойно висит выше или ниже окна.
    const winTop = win.sill + win.height;
    if (bottomY >= winTop || topY <= win.sill) continue;

    const wall = win.wall as WallSide;
    const half = win.width / 2;

    if (wall === 'north' || wall === 'south') {
      const wallZ = wall === 'north' ? -room.depth / 2 : room.depth / 2;
      if (Math.abs(point.z - wallZ) > nearWall) continue;
      if (Math.abs(point.x - win.offset) <= half) return true;
    } else {
      const wallX = wall === 'west' ? -room.width / 2 : room.width / 2;
      if (Math.abs(point.x - wallX) > nearWall) continue;
      if (Math.abs(point.z - win.offset) <= half) return true;
    }
  }

  return false;
}

/**
 * Участки верхнего ряда, свободные от окон, в локальных X ряда.
 *
 * Верхние шкафы поперёк окна — грубая ошибка, которую клиент замечает сразу,
 * поэтому ряд честно разрывается. Идём сэмплированием: так правило работает
 * при любом развороте гарнитура, а не только вдоль осей.
 */
export function upperRowSegments(
  item: Pick<FurnitureItem, 'position' | 'rotation'>,
  room: RoomConfig,
  rowLength: number,
  localZ: number,
  meta: KitchenMeta,
): Interval[] {
  const bottomY = meta.upperBottomY;
  const topY = bottomY + KITCHEN.upperHeight;
  const step = 0.02;
  const minSegment = 0.3;

  const segments: Interval[] = [];
  let start: number | null = null;

  for (let x = -rowLength / 2; x <= rowLength / 2 + 1e-9; x += step) {
    const point = toWorld(item, x, localZ);
    const free = !blockedByWindow(point, room, topY, bottomY);

    if (free && start === null) start = x;
    if (!free && start !== null) {
      if (x - start >= minSegment) segments.push([start, x]);
      start = null;
    }
  }

  if (start !== null && rowLength / 2 - start >= minSegment) {
    segments.push([start, rowLength / 2]);
  }

  return segments;
}

/* ─────────────────────────  Смета  ───────────────────────── */

export type KitchenPricing = {
  /** Цена погонного метра фасадов, из основной цены товара. */
  facadePerMeter: number;
  countertopPerMeter: number;
  upperPerMeter: number;
  includesUpper: boolean;
};

export function readKitchenPricing(
  price: number,
  meta: Record<string, unknown> | undefined,
): KitchenPricing {
  const raw = meta ?? {};
  return {
    facadePerMeter: price,
    countertopPerMeter: Math.max(0, num(raw.countertopPrice, 0)),
    upperPerMeter: Math.max(0, num(raw.upperPrice, 0)),
    includesUpper: raw.includesUpper === undefined ? true : Boolean(raw.includesUpper),
  };
}

export function isKitchen(item: Pick<FurnitureItem, 'type'>): boolean {
  return item.type === 'kitchen_unit';
}

/* ─────────────────────────  Связь с конфигуратором  ───────────────────────── */

/**
 * Модули из раскладки конфигуратора — в метры для 3D.
 *
 * KitchenUnit обязан строить меш ИЗ ЭТОГО МАССИВА, а не из собственной
 * разбивки: тогда 3D, чертёж, смета и рендер показывают клиенту одну и ту же
 * мебель. Своя разбивка осталась только запасным путём для сцены, собранной
 * ассистентом без замера.
 */
export type RunModuleLike = {
  widthMm: number;
  offsetMm: number;
  /** Пенал обязан остаться пеналом: на чертеже он во всю высоту. */
  kind?: string;
  heightMm?: number;
  appliance?: string;
  /** Начинка модуля в зонах без техники: штанга, полки, обувница. */
  section?: string;
  /** Два прибора в одном пенале: духовка и микроволновка. */
  column?: { top: string; bottom: string };
  /** Техника закрыта фасадом заподлицо. */
  builtIn?: boolean;
  frontType?: string;
  drawerCount?: number;
};

export function modulesFromRun(
  runModules: RunModuleLike[],
  totalWidthM: number,
): KitchenModule[] {
  const totalMm = totalWidthM * 1000;

  const roleOf = (appliance?: string, kind?: string): ModuleRole => {
    if (appliance === 'fridge') return 'fridge';
    if (kind === 'tall') return 'tall';
    if (!appliance) return 'plain';
    if (appliance.startsWith('sink')) return 'sink';
    if (appliance === 'hob') return 'hob';
    if (appliance.startsWith('dishwasher')) return 'dishwasher';
    return 'plain';
  };

  return runModules
    .filter((m) => m.widthMm > 0)
    .map((m) => ({
      width: m.widthMm / 1000,
      heightM: m.heightMm ? m.heightMm / 1000 : undefined,
      // Центр модуля в локальных координатах ряда: середина ряда — ноль.
      centerX: (m.offsetMm + m.widthMm / 2 - totalMm / 2) / 1000,
      role: roleOf(m.appliance, m.kind),
      hasOven: m.appliance === 'oven',
      drawers: m.frontType === 'drawers' && (m.drawerCount ?? 0) > 0,
    }));
}
