import { CORNER_SIZE_MM } from './modules';
import { zoneProfile } from './zones';
import type {
  FrontType,
  Module,
  ModuleKind,
  ModuleVariantKind,
  Run,
  ZoneKind,
} from '@/types/millwork';

/**
 * ВАРИАНТЫ МОДУЛЯ.
 *
 * Раскладка ставила в каждое место одно и то же: внизу дверца, наверху
 * глухой фасад. В цеху на каждом месте есть выбор — под мойкой свой модуль,
 * над мойкой сушилка, в узкую щель карго, в верхний ряд стекло или
 * подъёмник. Замерщик это знает и ждёт, что платформа тоже знает.
 *
 * Вариант — это НАЧИНКА КОНКРЕТНОГО МЕСТА, а не новый тип модуля: ширину,
 * позицию и раскладку по-прежнему считает `buildRun`. Здесь только то, что
 * в этом месте физически бывает.
 */

/** Чем место ограничено: над мойкой, над варочной, в углу. */
export type VariantPlace = 'any' | 'over_sink' | 'over_hob' | 'corner';

export type { ModuleVariantKind };

export type ModuleVariantSpec = {
  kind: ModuleVariantKind;
  title: string;
  /** Одна строка о том, зачем это здесь. */
  hint: string;
  row: 'base' | 'upper' | 'tall';
  minWidthMm: number;
  maxWidthMm: number;
  frontType: FrontType;
  /** Число фронтов ящиков, если вариант ящичный. */
  drawerCount?: number;
  /** Ключи статей сметы, которые добавляет вариант. */
  estimateKeys?: string[];
  /** Где вариант бывает. Пусто — во всех зонах, где есть такой ряд. */
  zones?: ZoneKind[];
  place?: VariantPlace;
  /**
   * Ширина не ограничивает.
   *
   * Раскладка выдаёт и 1225 мм — мебель делают на заказ. Обычная дверца
   * и глухой фасад бывают любой ширины, а вот карго шире 400 и стекло
   * шире 900 не бывает: там ограничение физическое.
   */
  anyWidth?: boolean;
  /**
   * У модуля под мойку ДНА НЕТ: там сифон. Это не деталь оформления —
   * по этому полю деталь пропадает из раскроя и из площади ЛДСП.
   */
  noBottom?: boolean;
};

/**
 * Каталог вариантов.
 *
 * Ширины отраслевые: карго уже 150 мм не бывает, ящики шире 900 провисают,
 * угловой модуль всегда 900. Из интерфейса эти границы не меняются — то же
 * правило, что у системы 32 и GEOMETRY.
 */
export const MODULE_VARIANTS: Record<ModuleVariantKind, ModuleVariantSpec> = {
  door: {
    kind: 'door',
    title: 'Дверца',
    hint: 'обычный модуль с полкой; шире 600 мм — две двери',
    row: 'base',
    minWidthMm: 300,
    maxWidthMm: 1200,
    frontType: 'door',
    anyWidth: true,
  },
  drawers: {
    kind: 'drawers',
    title: 'Ящики',
    hint: 'три фронта: кастрюли и крышки',
    row: 'base',
    minWidthMm: 400,
    maxWidthMm: 900,
    frontType: 'drawers',
    drawerCount: 3,
  },
  drawers_door: {
    kind: 'drawers_door',
    title: 'Ящик и дверца',
    hint: 'ящик сверху, дверца снизу',
    row: 'base',
    minWidthMm: 500,
    maxWidthMm: 900,
    frontType: 'drawers',
    drawerCount: 2,
  },
  cargo: {
    kind: 'cargo',
    title: 'Карго',
    hint: 'выдвижная бутылочница в узкое место',
    row: 'base',
    minWidthMm: 150,
    maxWidthMm: 400,
    frontType: 'door',
    estimateKeys: ['cargo_150'],
  },
  sink_base: {
    kind: 'sink_base',
    title: 'Под мойку',
    hint: 'без дна, вырез под сифон',
    row: 'base',
    minWidthMm: 600,
    maxWidthMm: 800,
    frontType: 'door',
    estimateKeys: ['sink_base'],
    place: 'over_sink',
    noBottom: true,
  },
  hob_base: {
    kind: 'hob_base',
    title: 'Под варочную',
    hint: 'верхний ящик укорочен под панель',
    row: 'base',
    minWidthMm: 600,
    maxWidthMm: 600,
    frontType: 'drawers',
    drawerCount: 2,
    place: 'over_hob',
  },
  corner_carousel: {
    kind: 'corner_carousel',
    title: 'Угловой с каруселью',
    hint: 'доступ в угол, механизм в смете',
    row: 'base',
    minWidthMm: CORNER_SIZE_MM,
    maxWidthMm: CORNER_SIZE_MM,
    frontType: 'door',
    estimateKeys: ['carousel_corner'],
    place: 'corner',
  },
  open_base: {
    kind: 'open_base',
    title: 'Открытая секция',
    hint: 'ниша без фасада: корзины, книги',
    row: 'base',
    minWidthMm: 300,
    maxWidthMm: 600,
    frontType: 'none',
    anyWidth: true,
  },

  upper_door: {
    kind: 'upper_door',
    title: 'Глухой фасад',
    hint: 'обычный верхний шкаф',
    row: 'upper',
    minWidthMm: 300,
    maxWidthMm: 1200,
    frontType: 'door',
    anyWidth: true,
  },
  upper_glass: {
    kind: 'upper_glass',
    title: 'Стекло в раме',
    hint: 'витрина: посуда на виду',
    row: 'upper',
    minWidthMm: 300,
    maxWidthMm: 900,
    frontType: 'door',
    estimateKeys: ['glass_front'],
  },
  upper_dryer: {
    kind: 'upper_dryer',
    title: 'Сушилка',
    hint: 'решётка внутри, ставится над мойкой',
    row: 'upper',
    minWidthMm: 600,
    maxWidthMm: 800,
    frontType: 'door',
    estimateKeys: ['dish_dryer'],
    place: 'over_sink',
  },
  upper_lift: {
    kind: 'upper_lift',
    title: 'Подъёмник',
    hint: 'фасад откидывается вверх — ради широких фасадов он и нужен',
    row: 'upper',
    minWidthMm: 400,
    maxWidthMm: 1200,
    frontType: 'door',
    estimateKeys: ['lift_aventos'],
  },
  upper_open: {
    kind: 'upper_open',
    title: 'Открытая полка',
    hint: 'без фасада',
    row: 'upper',
    minWidthMm: 300,
    maxWidthMm: 1200,
    frontType: 'none',
    anyWidth: true,
  },

  tall_shelves: {
    kind: 'tall_shelves',
    title: 'Полки',
    hint: 'пенал под запасы',
    row: 'tall',
    minWidthMm: 300,
    maxWidthMm: 600,
    frontType: 'door',
    anyWidth: true,
  },
  tall_cargo: {
    kind: 'tall_cargo',
    title: 'Высокое карго',
    hint: 'выдвижной пенал во всю высоту',
    row: 'tall',
    minWidthMm: 300,
    maxWidthMm: 600,
    frontType: 'door',
    estimateKeys: ['cargo_tall'],
  },
  tall_rod: {
    kind: 'tall_rod',
    title: 'Штанга',
    hint: 'верхняя одежда',
    row: 'tall',
    minWidthMm: 400,
    maxWidthMm: 900,
    frontType: 'door',
    zones: ['hallway', 'bedroom'],
  },
};

/** Карго уже этого не бывает: механизм не влезает. */
export const CARGO_MIN_MM = MODULE_VARIANTS.cargo.minWidthMm;
export const CARGO_MAX_MM = MODULE_VARIANTS.cargo.maxWidthMm;

/** Ряд модуля: от него зависит, какие варианты вообще смотреть. */
function rowOf(kind: ModuleKind): ModuleVariantSpec['row'] {
  if (kind === 'upper' || kind === 'corner_upper') return 'upper';
  if (kind === 'tall') return 'tall';
  return 'base';
}

/** Что стоит в этом модуле сейчас. */
export function currentVariant(unit: Module): ModuleVariantKind {
  if (unit.variant) return unit.variant;

  const row = rowOf(unit.kind);
  if (row === 'upper') return unit.frontType === 'none' ? 'upper_open' : 'upper_door';
  if (row === 'tall') return 'tall_shelves';
  if (unit.kind === 'corner_base') return 'corner_carousel';
  if (unit.frontType === 'none') return 'open_base';
  return unit.frontType === 'drawers' ? 'drawers' : 'door';
}

/** Над этим модулем мойка? Верхний ряд знает о нижнем по перекрытию. */
function overAppliance(unit: Module, run: Run, kinds: string[]): boolean {
  const from = unit.offsetMm;
  const to = unit.offsetMm + unit.widthMm;

  return run.modules.some((base) => {
    if (!base.appliance || !kinds.some((k) => base.appliance?.startsWith(k))) return false;
    const bFrom = base.offsetMm;
    const bTo = base.offsetMm + base.widthMm;
    // Перекрытие хотя бы наполовину: сушилка над краем мойки — не сушилка.
    const overlap = Math.min(to, bTo) - Math.max(from, bFrom);
    return overlap >= Math.min(unit.widthMm, base.widthMm) / 2;
  });
}

/**
 * ВАРИАНТЫ ДЛЯ ЭТОГО МЕСТА.
 *
 * Неподходящие не показываются ВОВСЕ, а не серыми: серая кнопка — это
 * вопрос «почему нельзя», а задавать его на встрече с клиентом некому.
 *
 * Место решает всё: сушилка бывает только над мойкой, вытяжка только над
 * варочной, карусель только в углу, а карго только там, где оно физически
 * помещается.
 */
export function variantsForModule(
  unit: Module,
  run: Run,
  zone: ZoneKind = 'kitchen',
): ModuleVariantSpec[] {
  // У техники варианта нет: габарит и содержимое диктует прибор.
  if (unit.appliance || unit.column) return [];
  // Доборная планка — вынужденная деталь, а не выбор.
  if (unit.kind === 'filler') return [];

  const row = rowOf(unit.kind);
  const profile = zoneProfile(zone);

  return Object.values(MODULE_VARIANTS).filter((spec) => {
    if (spec.row !== row) return false;

    // Зона: в спальне кухонных вариантов не бывает — то же правило, что
    // на шаге «Состав».
    if (spec.zones && !spec.zones.includes(zone)) return false;
    if (!spec.zones && profile.kind !== 'kitchen' && row !== 'tall') return false;

    /*
     * Ширина места: вариант, который не влезает, обещать нельзя. Верхнюю
     * границу проверяем только там, где она физическая: карго шире 400
     * не бывает, а обычная дверца бывает любой — мебель делают на заказ.
     */
    if (unit.widthMm < spec.minWidthMm) return false;
    if (!spec.anyWidth && unit.widthMm > spec.maxWidthMm) return false;

    // Карусель только в углу, а в углу — только карусель.
    const corner = unit.kind === 'corner_base';
    if (spec.place === 'corner') return corner;
    if (corner) return false;

    if (spec.place === 'over_sink') {
      return row === 'upper'
        ? overAppliance(unit, run, ['sink'])
        : // Нижний «под мойку» — это место, где мойка и стоит.
          overAppliance(unit, run, ['sink']);
    }
    if (spec.place === 'over_hob') return overAppliance(unit, run, ['hob']);

    return true;
  });
}

/**
 * Применить вариант к модулю.
 *
 * Меняется НАЧИНКА, а не габарит: ширина и позиция остаются, иначе ряд
 * перестал бы сходиться с длиной стены. Наполнение сбрасывается — его
 * пересчитает `fill` под новый вариант.
 */
export function applyVariant(unit: Module, kind: ModuleVariantKind): Module {
  const spec = MODULE_VARIANTS[kind];

  return {
    ...unit,
    variant: kind,
    frontType: spec.frontType,
    drawerCount: spec.frontType === 'drawers' ? (spec.drawerCount ?? 3) : 0,
    doorCount: spec.frontType === 'door' ? (unit.widthMm > 600 ? 2 : 1) : 0,
    label: spec.title,
    fill: undefined,
  };
}

/** Статьи сметы, которые добавляет вариант модуля. */
export function variantEstimateKeys(unit: Module): string[] {
  const kind = unit.variant;
  if (!kind) return [];
  return MODULE_VARIANTS[kind].estimateKeys ?? [];
}

/**
 * У модуля есть дно?
 *
 * У подмоечного его нет: там сифон. И это НЕ выбор варианта — модуль
 * мойки бездонный всегда, по факту прибора. Раньше эта деталь уезжала
 * в раскрой, и цех распиливал лист, чтобы его выбросить.
 */
export function hasBottom(unit: Module): boolean {
  if (unit.appliance?.startsWith('sink')) return false;
  const kind = unit.variant;
  return !(kind && MODULE_VARIANTS[kind].noBottom);
}

/** Модуль мойки: бездонный корпус с вырезом под сифон — своя работа. */
export function isSinkBase(unit: Module): boolean {
  return Boolean(unit.appliance?.startsWith('sink')) || unit.variant === 'sink_base';
}
