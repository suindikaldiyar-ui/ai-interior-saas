import type { Dimensions, WallSide } from './interior';

/**
 * Универсальная модель каталога.
 *
 * Добавление новой товарной категории не должно требовать ни строчки кода:
 * компания заводит категорию, указывает applies_to и unit — и товар сам
 * появляется в панели материалов и уходит в рендер.
 */

export const APPLIES_TO = [
  'floor',
  'wall',
  'ceiling',
  'zone',
  'object',
  'opening',
] as const;

export type AppliesTo = (typeof APPLIES_TO)[number];

export const APPLIES_TO_LABEL: Record<AppliesTo, string> = {
  floor: 'Пол',
  wall: 'Стены',
  ceiling: 'Потолок',
  zone: 'Зона',
  object: 'Предмет',
  opening: 'Проём',
};

export const CATALOG_UNITS = ['m2', 'piece', 'running_meter', 'set'] as const;
export type CatalogUnit = (typeof CATALOG_UNITS)[number];

export const UNIT_LABEL: Record<CatalogUnit, string> = {
  m2: 'м²',
  piece: 'шт',
  running_meter: 'пог. м',
  set: 'компл.',
};

export const ASSET_KINDS = [
  'texture',
  'swatch',
  'composite',
  'photo',
  'model',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type OrgRole = 'owner' | 'manager' | 'designer' | 'surveyor';

export type Org = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  accent_color: string;
  domain: string | null;
  plan: string;
  city?: string;
  phone?: string;
};

export type CatalogCategory = {
  id: string;
  org_id: string;
  key: string;
  name_ru: string;
  name_kk: string;
  applies_to: AppliesTo;
  unit: CatalogUnit;
  sort_order: number;
  is_active: boolean;
};

/** Раскладка модуля покрытия — из неё считается масштаб текстуры в 3D. */
export type TilingSpec = {
  /** Размер одного модуля в метрах: доска, плитка, полотно. */
  moduleSize?: [number, number];
  pattern?: 'straight' | 'herringbone' | 'brick' | 'grid';
  grout?: number;
};

/**
 * Какая поверхность товара. Для покрытий всегда 'main', а вот у зон —
 * кухни, шкафа-купе — поверхностей несколько, и у каждой свой референс.
 */
export const ASSET_ROLES = ['main', 'facade', 'countertop', 'backsplash'] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const ASSET_ROLE_LABEL: Record<AssetRole, string> = {
  main: 'Основной',
  facade: 'Фасад',
  countertop: 'Столешница',
  backsplash: 'Фартук',
};

export type CatalogAsset = {
  id: string;
  item_id: string;
  kind: AssetKind;
  role: AssetRole;
  storage_path: string;
  sort_order: number;
};

export type CatalogItem = {
  id: string;
  org_id: string;
  category_id: string;
  article: string;
  name_ru: string;
  name_kk: string;
  description: string;
  price: number;
  unit: CatalogUnit;
  dimensions: Partial<Dimensions>;
  tiling: TilingSpec;
  meta: Record<string, unknown>;
  is_active: boolean;
};

/** Товар вместе с категорией и файлами — то, чем оперирует интерфейс. */
export type CatalogEntryFull = CatalogItem & {
  category: CatalogCategory;
  assets: CatalogAsset[];
};

/* ─────────────────────────  Фурнитура организации  ───────────────────────── */

/**
 * ФУРНИТУРА — ЭТО ТОВАР КАТАЛОГА, А НЕ ВТОРАЯ ТАБЛИЦА.
 *
 * Петли, направляющие, крепёж и наполнение живут там же, где фасады и
 * столешницы: одна `catalog_items` плюс поля `meta` (ловушка 19). Второй
 * справочник под фурнитуру означал бы второй источник цен, а цена у
 * позиции одна — `CatalogItem.price`.
 *
 * Здесь только ОПИСАНИЕ товара: чей бренд, какая модель, с доводчиком
 * или без. Сколько их нужно — считает раскрой и состав ряда, и второго
 * счёта каталог не заводит.
 */
export type HardwareCategory = 'hinge' | 'slide' | 'fastener' | 'filling' | 'other';

export const HARDWARE_BRANDS = ['blum', 'hettich', 'hafele', 'boyard', 'gtv', 'dtc'] as const;
export type HardwareBrand = (typeof HARDWARE_BRANDS)[number];

/** Направляющие: телескоп, тандем, боксы. */
export type SlideKind = 'telescopic' | 'tandem' | 'boxes';

/** Крепёж: конфирмат, минификс, шкант, саморез. */
export type FastenerKind = 'confirmat' | 'minifix' | 'dowel' | 'screw';

/** Наполнение: штанга, карго, сушилка. */
export type FillingKind = 'rod' | 'cargo' | 'dryer';

/** Прочее: опоры, ручки, полкодержатели, подсветка. */
export type OtherHardwareKind = 'legs' | 'handles' | 'shelf_supports' | 'led';

/** Штуками или погонными метрами. */
export type HardwarePricingUnit = 'piece' | 'meter';

/**
 * МОНТАЖНЫЕ РАЗМЕРЫ — ХРАНИЛИЩЕ ПОД БУДУЩУЮ ПРИСАДКУ.
 *
 * `null` здесь означает «подтверждённых данных нет», и это не то же
 * самое, что ноль: по нулю цех просверлит отверстие на кромке. Пока
 * значение не подтверждено производителем, присадка по этой позиции НЕ
 * рассчитывается и операция сверления не создаётся.
 *
 * Поля заведены заранее, чтобы присадке было куда лечь, но в этом заходе
 * их не читает никто: расчёт присадки не тронут.
 */
export type MountingData = {
  /** Диаметр отверстия, мм. */
  holeDiameterMm: number | null;
  /** Глубина отверстия, мм. */
  holeDepthMm: number | null;
  /** Отступ от кромки детали, мм. */
  edgeOffsetMm: number | null;
  /** Отступ первого отверстия, мм. */
  firstHoleOffsetMm: number | null;
  /** Шаг между отверстиями, мм. */
  pitchMm: number | null;
  /** Отступ сверху, мм. */
  topOffsetMm: number | null;
  /** Отступ снизу, мм. */
  bottomOffsetMm: number | null;
  /** Присадка направляющей от дна, мм. */
  runnerOffsetMm: number | null;
  /** Прочие размеры производителя: имя → миллиметры. */
  extra: Record<string, number | null>;
};

/** Ни одного подтверждённого размера: ровно это лежит у новой позиции. */
export const EMPTY_MOUNTING: MountingData = {
  holeDiameterMm: null,
  holeDepthMm: null,
  edgeOffsetMm: null,
  firstHoleOffsetMm: null,
  pitchMm: null,
  topOffsetMm: null,
  bottomOffsetMm: null,
  runnerOffsetMm: null,
  extra: {},
};

/** Описание фурнитуры в `meta` товара каталога. */
export type HardwareMeta = {
  category: HardwareCategory;
  brand?: HardwareBrand;
  /** Модель или тип производителя: «Clip top», «Tandembox antaro». */
  model?: string;
  /** Петля: с доводчиком или без. */
  softClose?: boolean;
  slideKind?: SlideKind;
  fastenerKind?: FastenerKind;
  fillingKind?: FillingKind;
  otherKind?: OtherHardwareKind;
  pricingUnit?: HardwarePricingUnit;
  /**
   * Валюта хранится, но НЕ пересчитывается: перевода курсов в продукте
   * нет, и вводить его ради поля значило бы завести переключатель,
   * который ничего не меняет (ловушка 148). Сегодня всё в тенге.
   */
  currency?: string;
  mounting?: Partial<MountingData>;
};

/**
 * Позиция каталога, прочитанная как фурнитура.
 *
 * `active` берётся у самого товара (`is_active`), а не дублируется в
 * `meta`: два признака «включено» разошлись бы на первой же правке.
 */
export type HardwareItem = {
  id: string;
  orgId: string;
  name: string;
  article: string;
  /** Цена позиции. Единственное место, где она лежит. */
  price: number;
  active: boolean;
  /** Ключ статьи сметы: по нему позиция попадает в расчёт. */
  estimateKey: string;
  hardware: HardwareMeta;
  mounting: MountingData;
};

/* ─────────────────────────  Цели назначения  ───────────────────────── */

/**
 * targetKey — куда назначен товар:
 *   'floor' | 'ceiling'          — поверхность целиком
 *   'wall:north' | 'wall:east'   — конкретная стена
 *   'zone:kitchen'               — функциональная зона
 *   <itemId>                     — конкретный объект сцены
 */
export type TargetKey = string;

export const SURFACE_TARGETS = [
  'floor',
  'ceiling',
  'wall:north',
  'wall:south',
  'wall:west',
  'wall:east',
] as const;

export function wallTarget(wall: WallSide): TargetKey {
  return `wall:${wall}`;
}

/**
 * Кухня — это ТРИ поверхности: фасады, столешница и фартук, и у каждой свой
 * ключ.
 *
 * Фасады раньше писались под id объекта сцены — и не писались вовсе: на шаге
 * «Материалы» сцена ещё не смонтирована, id нет, записывать некуда. Товар не
 * выбирался, а интерфейс молчал. Ключ не должен зависеть от того, поднята
 * сцена или нет.
 *
 * Значения попадают в сохранённые проекты, менять их нельзя — старые объекты
 * потеряют выбранный товар.
 */
export const FACADE_TARGET: TargetKey = 'zone:kitchen';
export const COUNTERTOP_TARGET: TargetKey = 'zone:countertop';
export const APRON_TARGET: TargetKey = 'zone:backsplash';

export function targetLabel(key: TargetKey): string {
  if (key === FACADE_TARGET) return 'Фасады кухни';
  if (key === COUNTERTOP_TARGET) return 'Столешница';
  if (key === APRON_TARGET) return 'Фартук';
  if (key === 'floor') return 'Пол';
  if (key === 'ceiling') return 'Потолок';
  if (key.startsWith('wall:')) {
    const map: Record<string, string> = {
      north: 'Стена north (задняя)',
      south: 'Стена south (передняя)',
      west: 'Стена west (левая)',
      east: 'Стена east (правая)',
    };
    return map[key.slice(5)] ?? key;
  }
  if (key.startsWith('zone:')) return `Зона: ${key.slice(5)}`;
  return key;
}

/** Какие targetKey допустимы для товара с данным applies_to. */
export function targetsFor(appliesTo: AppliesTo): TargetKey[] {
  switch (appliesTo) {
    case 'floor':
      return ['floor'];
    case 'ceiling':
      return ['ceiling'];
    case 'wall':
      return ['wall:north', 'wall:south', 'wall:west', 'wall:east'];
    default:
      return [];
  }
}

/** Покрытия подставляются в 3D мгновенно; zone/object/opening — только в рендере. */
export function isSurfaceKind(appliesTo: AppliesTo): boolean {
  return appliesTo === 'floor' || appliesTo === 'wall' || appliesTo === 'ceiling';
}

/* ─────────────────────────  Производство  ───────────────────────── */

/**
 * Настройки цеха.
 *
 * У каждой компании свои толщины и свои зазоры. Захардкоженные числа
 * сделали бы детализировку неверной для половины клиентов, а неверная
 * детализировка хуже её отсутствия: по ней распилят плиту.
 */
export type ProductionSettings = {
  /** Толщина ЛДСП корпуса, мм. */
  carcassMm: 16 | 18;
  /** Толщина фасада, мм. */
  frontMm: 16 | 18 | 19;
  /** Толщина ХДФ задней стенки, мм. */
  backMm: 3 | 4;
  /** Задняя стенка вкладная (в паз) или накладная (на гвозди). */
  backMount: 'inset' | 'overlay';
  /** Зазор вокруг фасада, мм. */
  frontGapMm: 3 | 4;
  /** Видимая кромка, мм. Скрытая всегда 0.4. */
  visibleEdgeMm: 1 | 2;
  /**
   * ПРИПУСКИ ДЕТАЛЕЙ — НАСКОЛЬКО ДЕТАЛЬ МЕНЬШЕ ГАБАРИТА.
   *
   * «Модуль 900 — столешница минус 40, что-то ещё минус 60»: у каждого
   * цеха эти числа свои, и захардкоженные они делают раскрой неверным
   * для половины клиентов — а неверный раскрой хуже его отсутствия, по
   * нему распилят плиту.
   *
   * Заводятся один раз в `/admin/production`, дальше раскрой считается
   * по ним. Толщины, зазор фасада и кромка лежат рядом — они тоже
   * припуски, просто заведены раньше.
   */
  allowances: PartAllowances;
  /**
   * ГЛУБИНЫ РЯДОВ — ШКОЛА ЦЕХА, А НЕ ОТРАСЛЕВОЙ СТАНДАРТ.
   *
   * Один мебельщик работает на 550/350, другой на 600/300. Захардкоженные
   * числа делают раскрой неверным для половины клиентов, а неверный
   * раскрой хуже отсутствующего: по нему распилят плиту.
   */
  depths: RowDepths;
  /**
   * ВЫСОТЫ РЯДА. Здесь лежат только ПЕРВИЧНЫЕ величины.
   *
   * Рабочая поверхность и низ верхнего ряда — ПРОИЗВОДНЫЕ, и в настройках
   * их нет вовсе: они считаются формулой (`workTopMm`, `upperBottomMm`).
   * Положи их сюда полем — и появится второе место, где 900 и 1500 живут
   * своей жизнью, расходясь с цоколем и боковиной.
   */
  heights: RowHeights;
};

/** Глубина корпуса по рядам, мм. */
export type RowDepths = {
  /** Нижний ряд. От него же считается глубина колонны прибора. */
  baseMm: number;
  /** Верхний ряд. */
  upperMm: number;
  /**
   * Антресоль. У мебельщика она идёт по глубине НИЖНЕГО ряда, а не
   * верхнего: сверху её не видно, зато в неё кладут то, что не влезло.
   * Поэтому это своё число, а не «как у верхнего».
   */
  mezzanineMm: number;
};

/** Первичные высоты ряда, мм. Производные из них считаются формулой. */
export type RowHeights = {
  /** Цоколь: на нём стоит корпус. */
  plinthMm: number;
  /** Боковина нижнего корпуса. */
  carcassMm: number;
  /** Толщина столешницы. */
  countertopMm: number;
  /** Фартук: полоса стены от столешницы до низа навесных. */
  apronMm: number;
};

export const DEFAULT_DEPTHS: RowDepths = {
  baseMm: 560,
  upperMm: 320,
  mezzanineMm: 320,
};

export const DEFAULT_HEIGHTS: RowHeights = {
  plinthMm: 100,
  carcassMm: 720,
  countertopMm: 38,
  /*
   * 592 — это не отраслевое число, а РАЗНИЦА: прежние 1450 минус прежние
   * 858. Умолчание обязано воспроизводить то, что было, до миллиметра —
   * иначе поедут все сохранённые проекты.
   */
  apronMm: 592,
};

/**
 * Уменьшение детали относительно габарита модуля, мм.
 *
 * Названия — по деталям раскроя, а не по абстракциям: технолог узнаёт
 * свои числа в лицо.
 */
export type PartAllowances = {
  /** Полка уже проёма: иначе не встанет. */
  shelfSideMm: number;
  /** Полка мельче глубины корпуса: она чуть глубже фасада не бывает. */
  shelfDepthMm: number;
  /** Перегородка мельче глубины корпуса. */
  dividerDepthMm: number;
  /**
   * Задняя стенка при ВКЛАДНОМ монтаже: садится в паз, поэтому меньше
   * габарита модуля на эту величину по высоте и по ширине.
   */
  backInsetMm: number;
};

export const DEFAULT_ALLOWANCES: PartAllowances = {
  shelfSideMm: 2,
  shelfDepthMm: 20,
  dividerDepthMm: 20,
  backInsetMm: 8,
};

export const DEFAULT_PRODUCTION: ProductionSettings = {
  carcassMm: 16,
  frontMm: 16,
  backMm: 3,
  backMount: 'inset',
  frontGapMm: 4,
  visibleEdgeMm: 2,
  allowances: DEFAULT_ALLOWANCES,
  depths: DEFAULT_DEPTHS,
  heights: DEFAULT_HEIGHTS,
};

/** Настройки организации с подстановкой значений по умолчанию. */
export function productionSettings(raw: unknown): ProductionSettings {
  const value = (raw ?? {}) as Partial<ProductionSettings>;
  const pick = <K extends keyof ProductionSettings>(
    key: K,
    allowed: ProductionSettings[K][],
  ): ProductionSettings[K] =>
    allowed.includes(value[key] as ProductionSettings[K])
      ? (value[key] as ProductionSettings[K])
      : DEFAULT_PRODUCTION[key];

  return {
    carcassMm: pick('carcassMm', [16, 18]),
    frontMm: pick('frontMm', [16, 18, 19]),
    backMm: pick('backMm', [3, 4]),
    backMount: pick('backMount', ['inset', 'overlay']),
    frontGapMm: pick('frontGapMm', [3, 4]),
    visibleEdgeMm: pick('visibleEdgeMm', [1, 2]),
    allowances: allowances(value.allowances),
    depths: {
      baseMm: size(value.depths?.baseMm, DEFAULT_DEPTHS.baseMm, 300, 900),
      upperMm: size(value.depths?.upperMm, DEFAULT_DEPTHS.upperMm, 150, 600),
      mezzanineMm: size(value.depths?.mezzanineMm, DEFAULT_DEPTHS.mezzanineMm, 150, 900),
    },
    heights: {
      plinthMm: size(value.heights?.plinthMm, DEFAULT_HEIGHTS.plinthMm, 0, 250),
      carcassMm: size(value.heights?.carcassMm, DEFAULT_HEIGHTS.carcassMm, 400, 1000),
      countertopMm: size(value.heights?.countertopMm, DEFAULT_HEIGHTS.countertopMm, 10, 120),
      apronMm: size(value.heights?.apronMm, DEFAULT_HEIGHTS.apronMm, 300, 900),
    },
  };
}

/**
 * Габарит компании с подстановкой умолчания.
 *
 * Границы физические, а не «правильные»: 550 и 600 одинаково законны, а
 * вот глубина 40 мм — это мусор из базы, а не школа цеха.
 */
function size(raw: unknown, fallback: number, minMm: number, maxMm: number): number {
  const given = Number(raw);
  return Number.isFinite(given) && given >= minMm && given <= maxMm
    ? Math.round(given)
    : fallback;
}

/**
 * Припуски компании с подстановкой умолчаний.
 *
 * Число принимается любое неотрицательное в разумных пределах: у цеха
 * свои нормы, и подрезать их «правильными» значениями — это ровно тот
 * захардкоженный раскрой, от которого настройка и уводит. Мусор при
 * этом не принимается: отрицательная полка длиннее проёма.
 */
export function allowances(raw: unknown): PartAllowances {
  const value = (raw ?? {}) as Partial<PartAllowances>;
  const mm = (key: keyof PartAllowances): number => {
    const given = Number(value[key]);
    return Number.isFinite(given) && given >= 0 && given <= 200
      ? Math.round(given)
      : DEFAULT_ALLOWANCES[key];
  };

  return {
    shelfSideMm: mm('shelfSideMm'),
    shelfDepthMm: mm('shelfDepthMm'),
    dividerDepthMm: mm('dividerDepthMm'),
    backInsetMm: mm('backInsetMm'),
  };
}

/* ─────────────────────────  Проекты  ───────────────────────── */

export type ProjectSelections = Record<TargetKey, string>;

export type Measurements = {
  width?: number;
  depth?: number;
  height?: number;
  note?: string;
  confirmed?: boolean;
};

export type SpecLine = {
  targetKey: TargetKey;
  targetLabel: string;
  article: string;
  name: string;
  unit: CatalogUnit;
  price: number;
  quantity: number;
  total: number;
};
