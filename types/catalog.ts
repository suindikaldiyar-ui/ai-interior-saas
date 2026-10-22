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
  /** Поверхность товара; у фурнитуры — изображение `hw-1`, `hw-2`… (`HardwareMediaEntry.role`). */
  role: AssetRole | `hw-${number}`;
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

/**
 * ОБРАЗЕЦ ДЕКОРА ИЗ БРОШЮРЫ ПРОИЗВОДИТЕЛЯ — REFERENCE_ONLY.
 *
 * Картинка из PDF производителя, сопоставленная с позицией по коду и
 * структуре дословно (`scripts/build-reference-textures.ts`). Не PBR, не
 * бесшовная текстура, права не подтверждены; размер в мм ПРИНЯТ —
 * масштаб печати производитель не указывает.
 */
export type ReferenceTexture = {
  /** Файл образца в папке образцов на сервере (вне git, как и пакет). */
  file: string;
  px: [number, number];
  /** Принятый размер образца, мм (`basis: assumed`). */
  mm: [number, number];
  source: 'edc26' | 'worktops' | 'grandex-pack';
  page: number | null;
  /** Подпись под образцом в брошюре — дословно. */
  caption: string | null;
  /** Почему образец не со страницы позиции или чем отличается — словами. */
  note: string | null;
  /** Средний цвет самого образца (без полей страницы). */
  hex: string;
  /** Куда идёт рисунок в файле: плита — вдоль v, столешница — вдоль u. */
  grain: 'vertical' | 'horizontal' | 'none';
  /** Файл повёрнут на 90° относительно брошюры, чтобы волокно легло по правилу. */
  rotated: boolean;
};

/** Товар вместе с категорией и файлами — то, чем оперирует интерфейс. */
export type CatalogEntryFull = CatalogItem & {
  category: CatalogCategory;
  assets: CatalogAsset[];
  /**
   * Образец декора из брошюры — ПРОИЗВОДНОЕ от `meta.provenance.preview` и
   * таблицы образцов (`withReferences`), в базу не пишется. Нет у позиции —
   * поля нет.
   */
  reference?: ReferenceTexture;
  /**
   * СТРОКА ПРОЧИТАНА БЕЗ ПАСПОРТА (HARDWARE-PHOTO-PERF-01) — производное
   * чтения, в базу не пишется.
   *
   * У позиции производителя (артикул «MFR-…») лёгкое чтение каталога
   * (`fetchCatalog(…, { hardware: 'light' })`) берёт из `meta.hardware`
   * только то, что читают подбор, смета и сцена. Напечатанные размеры,
   * присадка, формулы, заметки и «чего нет» дочитываются по позиции
   * (`fetchCatalogDetails`). Пока поле стоит, отсутствие присадки в записи
   * значит «не дочитано», а не «в паспорте нет», — и `meta` такой строки
   * обратно в базу не пишется: она неполная.
   */
  detail?: 'light';
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
export type HardwareCategory =
  | 'hinge'
  | 'slide'
  | 'fastener'
  | 'filling'
  | 'other'
  /*
   * ГРУППЫ КАТАЛОГА ПРОИЗВОДИТЕЛЕЙ (HARDWARE-01). Прежние пять ключей
   * читаются как были: позиции, заведённые раньше, не переезжают.
   */
  | 'drawer_system'
  | 'lift'
  | 'wardrobe'
  | 'kitchen'
  | 'handle'
  | 'carcass'
  | 'sliding';

/**
 * ГРУППЫ ФУРНИТУРЫ НА ЭКРАНЕ — девять, как у мебельщика (HARDWARE-01).
 * Ключ — категория позиции; прежние `fastener`, `filling`, `other` идут
 * в свою группу, чтобы позиции, заведённые до каталога, не потерялись.
 */
export const HARDWARE_GROUPS: { key: string; letter: string; title: string; categories: HardwareCategory[] }[] = [
  { key: 'hinge', letter: 'A', title: 'Петли', categories: ['hinge'] },
  { key: 'slide', letter: 'B', title: 'Направляющие', categories: ['slide'] },
  { key: 'drawer_system', letter: 'C', title: 'Системы ящиков', categories: ['drawer_system'] },
  { key: 'lift', letter: 'D', title: 'Подъёмные механизмы', categories: ['lift'] },
  { key: 'wardrobe', letter: 'E', title: 'Гардеробные механизмы', categories: ['wardrobe', 'filling'] },
  { key: 'kitchen', letter: 'F', title: 'Кухонная фурнитура', categories: ['kitchen'] },
  { key: 'handle', letter: 'G', title: 'Ручки', categories: ['handle'] },
  { key: 'carcass', letter: 'H', title: 'Корпусная фурнитура', categories: ['carcass', 'fastener', 'other'] },
  { key: 'sliding', letter: 'I', title: 'Раздвижные системы', categories: ['sliding'] },
];

/** Как движется механизм — по источнику; по нему сцена выбирает движение. */
export type HardwareMovement = 'rotate' | 'slide_out' | 'lift_up' | 'fold_up' | 'lower' | 'slide_lateral' | 'push_open' | 'none';

/**
 * ИНЖЕНЕРНЫЙ СТАТУС ПОЗИЦИИ — по источнику, а не по нашему желанию.
 *
 *   VERIFIED      артикул и размеры для подбора напечатаны и сверены по изображению;
 *   PARTIAL       артикул и часть размеров есть — чего нет, сказано в `missing`;
 *   MISSING_DATA  изделие упомянуто, технических данных нет;
 *   CONFLICT      источник противоречит сам себе;
 *   NOT_READABLE  данные на странице есть, но не читаются.
 */
export type HardwareEngineeringStatus = 'VERIFIED' | 'PARTIAL' | 'MISSING_DATA' | 'CONFLICT' | 'NOT_READABLE';

/** Откуда данные позиции: файл и страница либо адрес, и дата проверки. */
export type HardwareSource = {
  file?: string;
  url?: string;
  pdfPage?: number;
  printedPage?: string;
  checkedAt: string;
};

/**
 * ПРИСАДКА ПО ИСТОЧНИКУ — как напечатана: размерная цепочка и база.
 * Чего не напечатано, того нет (`null`): отверстие по нему не ставится.
 */
export type HardwareDrillingSpec = {
  part: 'door' | 'cabinet_side' | 'drawer_side' | 'front' | 'other';
  what: string;
  diameterMm: number | null;
  depthMm: number | null;
  /** Цепочка размеров как напечатана: «37 / 128 / 64». */
  positionsMm: string | null;
  /** От чего отсчёт — как напечатано; не подписано — так и сказано. */
  datum: string | null;
};

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
  /*
   * ── ЗАПИСЬ ИЗДЕЛИЯ ПРОИЗВОДИТЕЛЯ (HARDWARE-01) ──
   *
   * Всё ниже необязательно и лежит в том же `meta.hardware`: второго
   * каталога и второй таблицы нет (ловушка 19). Неизвестное — отсутствие
   * поля, а не ноль: по нулю цех просверлит отверстие на кромке.
   */
  /** Производитель словом, как в каталоге: «Hettich», «Häfele». */
  manufacturer?: string;
  /** Артикул производителя ровно как напечатан: «9 114 271». */
  manufacturerArticle?: string;
  /** Название как в каталоге производителя. */
  officialName?: string;
  /** Подвид: `overlay`, `ball_bearing_full_extension`, `pantograph`, `cargo`… */
  subcategory?: string;
  series?: string;
  /** Чем артикул отличается внутри серии — как напечатано. */
  variant?: string;
  /**
   * РАЗМЕРЫ ДЛЯ ПОДБОРА — под каноническими именами, которые читает движок
   * (`nominalLength`, `sideClearance`, `minCabinetDepth`, `plateHeight`…;
   * таблица — `FIT_KEYS` в `lib/millwork/hardwareCatalog.ts`). Число одно:
   * как напечатано, оно лежит словами в `printed`, а здесь — то, по чему
   * проверяется посадка.
   */
  dimensionsMm?: Record<string, number>;
  /** Пределы для подбора под каноническими именами: «doorThickness» → [мин, макс], мм. */
  ranges?: Record<string, [number, number]>;
  /** Размеры и пределы так, как они напечатаны в источнике: подпись и значение словами. */
  printed?: { label: string; value: string }[];
  /** Формулы ровно как напечатаны: «SKW = LW − 42». */
  formulas?: string[];
  loadCapacityKg?: number;
  material?: string;
  finish?: string;
  movementType?: HardwareMovement;
  openingAngleDeg?: number;
  strokeMm?: number;
  /** Упаковка как напечатана: «1/10 компл.». */
  packaging?: string;
  /**
   * ЧТО ТАКОЕ ОДНА ЕДИНИЦА ПРОДАЖИ — по источнику: пара, штука, комплект.
   * Не сказано в источнике — поля нет, и смета это называет, а не угадывает.
   */
  saleUnit?: 'pair' | 'piece' | 'set';
  compatibleWith?: string;
  drilling?: HardwareDrillingSpec[];
  source?: HardwareSource;
  /** Права на картинки и CAD производителя: не проверены — не публикуем. */
  rightsStatus?: 'NOT_VERIFIED' | 'PERMITTED' | 'RESTRICTED';
  engineeringStatus?: HardwareEngineeringStatus;
  /**
   * ЧЕМ ИЗДЕЛИЕ НАРИСОВАНО В 3D: настоящей CAD-моделью производителя или
   * своим приближением по размерам источника. Приближение не выдаётся
   * за инженерную модель — так и подписано.
   */
  visualStatus?: 'CAD' | 'VISUAL_APPROXIMATION';
  /** CAD-модель, переведённая в GLB, — только если права подтверждены. */
  model3d?: { url: string; format: 'glb'; units: 'mm' };
  /** Чего в источнике нет, но нужно для установки или присадки. */
  missing?: string[];
  notes?: string;
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
  /**
   * Запись изделия прочитана без паспорта карточки (`CatalogEntryFull.detail`).
   * Присадки, напечатанных размеров и заметок здесь нет потому, что их не
   * дочитали, — не потому, что их нет в источнике.
   */
  detail?: 'light';
};

/* ─────────────────  Изображения фурнитуры (HARDWARE-PHOTO-PERF-01)  ───────────────── */

/**
 * ЧТО ИЗОБРАЖЕНО — по отношению к артикулу.
 *
 *   EXACT_PRODUCT        именно этот артикул;
 *   SERIES_REFERENCE     изделие серии: точное исполнение артикула не подтверждено;
 *   INSTALLATION_EXAMPLE изделие в мебели — пример установки;
 *   TECHNICAL_DRAWING    чертёж с размерами.
 */
export const HARDWARE_IMAGE_KINDS = ['EXACT_PRODUCT', 'SERIES_REFERENCE', 'INSTALLATION_EXAMPLE', 'TECHNICAL_DRAWING'] as const;
export type HardwareImageKind = (typeof HARDWARE_IMAGE_KINDS)[number];

/** Права на изображение: файл в продукте живёт только у VERIFIED. */
export const HARDWARE_IMAGE_RIGHTS = ['VERIFIED', 'NOT_VERIFIED', 'RESTRICTED'] as const;
export type HardwareImageRights = (typeof HARDWARE_IMAGE_RIGHTS)[number];

/**
 * ИЗОБРАЖЕНИЕ ПОЗИЦИИ — запись в `meta.media` той же строки `catalog_items`.
 *
 * Файлы — строки `catalog_assets` этой позиции с ролью `role`: оригинал
 * (kind 'photo') и миниатюра без обрезки (kind 'swatch'). Нет роли — у
 * изображения только ссылка у производителя: права не подтверждены, и
 * копии файла в продукте нет.
 */
export type HardwareMediaEntry = {
  /** Роль файлов в `catalog_assets`: `hw-1`, `hw-2`… Только у `rights: 'VERIFIED'`. */
  role?: string;
  kind: HardwareImageKind;
  rights: HardwareImageRights;
  /** Где изображение у производителя — страница товара или каталога. */
  sourceUrl?: string;
  /** Чем подтверждено право — словами: «своя съёмка», «письмо производителя от …». У файла обязательно. */
  rightsNote?: string;
  /** Когда проверено: ГГГГ-ММ-ДД. */
  checkedAt: string;
  /** Главное изображение карточки списка. */
  primary?: true;
  /** Ракурс или подпись: «спереди», «в шкафу». */
  caption?: string;
};

/**
 * ЧЕМ ПОЗИЦИЯ НАРИСОВАНА В 3D — выводится, а не хранится (`model3dStatusOf`).
 *
 *   OFFICIAL_CAD          CAD-модель производителя с подтверждёнными правами;
 *   VISUAL_RECONSTRUCTION модель по чертежу производителя с его размерами;
 *   VISUAL_APPROXIMATION  условная модель сцены — приближение, не CAD;
 *   NO_3D                 сцена позицию не рисует.
 */
export type HardwareModel3dStatus = 'OFFICIAL_CAD' | 'VISUAL_RECONSTRUCTION' | 'VISUAL_APPROXIMATION' | 'NO_3D';

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
  /**
   * РАЗМЕРЫ УГЛА — НАСТРОЙКА ОРГАНИЗАЦИИ, ПОКА НЕ ПОДТВЕРЖДЁННАЯ ЦЕХОМ.
   *
   * Пусто — типовые числа (`DEFAULT_CORNER_SIZES`), и это сказано словами:
   * у каждого размера стоит пометка «не подтверждено цехом», пока цех не
   * поставит галочку. Других размеров, кроме перечисленных в типе, нет:
   * выдумывать угловой модуль на 950 значит отправить в цех корпус,
   * которого никто не подтверждал.
   */
  corner?: CornerSizes;
  /**
   * СТОЛЕШНИЦА У ПРЕПЯТСТВИЯ — НАСТРОЙКА ОРГАНИЗАЦИИ, ПОКА НЕ ПОДТВЕРЖДЁННАЯ
   * ЦЕХОМ (слой 56).
   *
   * Колонна, короб или выступ стены в толщине столешницы: если перед ними
   * остаётся полоса плиты не уже этой — плита одна, с вырезом сзади; уже —
   * разрыв, две плиты с торцами. Узкая полоса без опоры снизу ломается, и
   * где она ещё держит, знает цех, а не код. Пусто — типовые 300 мм с
   * пометкой «не подтверждено цехом».
   */
  countertopStrip?: CountertopStrip;
  /**
   * РАСКРОЙ ЛИСТОВ — НАСТРОЙКА ЦЕХА (CUT-01).
   *
   * Пропил, обрезка кромки листа, полезный остаток и форматы листов у
   * каждого цеха свои: зашитые в код, они дали бы карту, по которой пила
   * не пройдёт. Пусто — типовые пропил, обрезка и остаток с пометкой «не
   * подтверждено цехом» и НИ ОДНОГО формата: лист выбирает человек.
   */
  cutting?: CuttingSettings;
  /**
   * ПРАВИЛА КОРОБА ЯЩИКА ЦЕХА (HARDWARE-01).
   *
   * Короб деревянного ящика — две боковины во всю длину направляющей,
   * торцы между боковинами и дно — режется из плиты цеха, и его толщины,
   * дно и высота — школа цеха, а не данные направляющей. Пусто — правил
   * нет, и короб не считается вовсе: ящик остаётся черновиком, выпуск в
   * цех заперт (ловушка 578). Умолчаний нет: выдуманный короб — это
   * распиленная плита.
   */
  drawerBox?: DrawerBoxSettings;
};

/**
 * ПРАВИЛА КОРОБА ЯЩИКА ЦЕХА. Длину короба и его ширину даёт направляющая
 * (её паспорт), а не цех; толщины, дно, зазоры по высоте и место
 * направляющей на боковине — школа цеха, и умолчаний у них нет.
 */
export type DrawerBoxSettings = {
  /**
   * Толщина боковин и торцов короба, мм. Режутся из корпусной ЛДСП модуля
   * — того же декора, что корпус; другая толщина — другой лист.
   */
  sideMm: number;
  /** Толщина дна, мм. */
  bottomMm: number;
  /** Дно из корпусной ЛДСП или из ХДФ, как задняя стенка. */
  bottomMaterial: 'ldsp' | 'hdf';
  /**
   * КАК СТОИТ ДНО:
   *   groove — в паз всех четырёх стенок (`bottomGrooveMm`);
   *   inset  — вкладное заподлицо между стенками;
   *   under  — накладное снизу на весь короб.
   */
  bottomMount: 'groove' | 'inset' | 'under';
  /** Глубина паза под дно, мм — только у `groove`. */
  bottomGrooveMm: number;
  /** От низа зоны ящика до низа короба, мм. */
  gapBelowMm: number;
  /** От верха короба до верха зоны ящика, мм. */
  gapAboveMm: number;
  /**
   * Ось направляющей на боковине короба от его низа, мм. Не задано —
   * присадка направляющих по высоте не рассчитывается (DRILLING_NOT_VERIFIED).
   */
  runnerAxisMm: number | null;
  /** Кромка по верхним торцам боковин и торцов короба. */
  edge: 'none' | '0.4' | '1' | '2';
  /** Цех подтвердил эти числа. Нет — «не подтверждено цехом», и выпуск заперт. */
  confirmed: boolean;
};

export const DRAWER_BOX_RANGES_MM = {
  sideMm: [10, 25],
  bottomMm: [3, 25],
  bottomGrooveMm: [0, 12],
  gapBelowMm: [0, 100],
  gapAboveMm: [0, 200],
  runnerAxisMm: [0, 300],
} as const;

/**
 * Правила короба организации; мусор не принимается — тогда правил нет
 * (`null`): короб, собранный из половины чисел, — та же выдумка.
 */
export function drawerBoxSettings(raw: unknown): DrawerBoxSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<Record<keyof DrawerBoxSettings, unknown>>;
  const mm = (key: keyof typeof DRAWER_BOX_RANGES_MM) => {
    if (value[key] === null || value[key] === undefined || value[key] === '') return null;
    const n = Number(value[key]);
    const [min, max] = DRAWER_BOX_RANGES_MM[key];
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : null;
  };
  const sideMm = mm('sideMm');
  const bottomMm = mm('bottomMm');
  const gapBelowMm = mm('gapBelowMm');
  const gapAboveMm = mm('gapAboveMm');
  const mount = value.bottomMount;
  if (mount !== 'groove' && mount !== 'inset' && mount !== 'under') return null;
  const groove = mm('bottomGrooveMm');
  /* Паз есть только у дна в паз — и у него он не ноль. */
  const bottomGrooveMm = mount === 'groove' ? groove : 0;
  if (sideMm === null || bottomMm === null || gapBelowMm === null || gapAboveMm === null) return null;
  if (bottomGrooveMm === null || (mount === 'groove' && bottomGrooveMm <= 0)) return null;
  const edge = value.edge;
  return {
    sideMm,
    bottomMm,
    bottomMaterial: value.bottomMaterial === 'hdf' ? 'hdf' : 'ldsp',
    bottomMount: mount,
    bottomGrooveMm,
    gapBelowMm,
    gapAboveMm,
    runnerAxisMm: mm('runnerAxisMm'),
    edge: edge === '0.4' || edge === '1' || edge === '2' ? edge : 'none',
    confirmed: value.confirmed === true,
  };
}

/**
 * ФОРМАТ ЛИСТА ЦЕХА (CUT-01).
 *
 * `stock` — к чему он относится: вид плиты и толщина («ldsp:16») либо одна
 * группа листа целиком, с декором («ldsp:16:item:…»). Длина — вдоль неё
 * идёт текстура декора, и она не меньше ширины: «1830 × 2750» читается как
 * 2750 × 1830.
 */
export type SheetFormat = { stock: string; lengthMm: number; widthMm: number };

export type CuttingSettings = {
  /** Ширина пропила пилы, мм (десятые доли). */
  kerfMm: number;
  /** Обрезка кромки листа с каждой стороны, мм, вместе с пропилом обрезного реза. */
  trimMm: number;
  /** Остаток, у которого обе стороны не короче, — полезный; меньше — отход. */
  minRemnantMm: number;
  /** Деталь, направление которой не задаёт текстура, можно повернуть на 90°. */
  rotate: boolean;
  sheets: SheetFormat[];
  /**
   * ТЕКСТУРА ГРУППЫ ЛИСТА, НАЗВАННАЯ ЧЕЛОВЕКОМ: `grain` — учитывать,
   * `plain` — однотонный, детали можно поворачивать. Нет записи — по
   * каталогу и по виду плиты (`cutting.ts`, `groupGrain`).
   */
  texture: Record<string, 'grain' | 'plain'>;
  /** Цех подтвердил пропил, обрезку и остаток. Нет — «не подтверждено цехом», выпуск заперт. */
  confirmed: boolean;
};

/**
 * Типовые пропил 4, обрезка 10, остаток от 300 мм — с пометкой «не
 * подтверждено цехом», пока цех не поставит галочку. Форматов листов среди
 * типовых нет: лист выбирает человек, и до выбора детали этой плиты не
 * раскладываются.
 */
export const TYPICAL_CUTTING: CuttingSettings = {
  kerfMm: 4,
  trimMm: 10,
  minRemnantMm: 300,
  rotate: true,
  sheets: [],
  texture: {},
  confirmed: false,
};

/** Границы — физика пилы и плиты, а не «правильные» значения чужого цеха. */
export const KERF_RANGE_MM = [1, 10] as const;
export const TRIM_RANGE_MM = [0, 50] as const;
export const MIN_REMNANT_RANGE_MM = [50, 2000] as const;
export const SHEET_SIDE_RANGE_MM = [300, 5000] as const;

/** Ключ группы листа: вид плиты, толщина и (необязательно) декор. */
const SHEET_STOCK_KEY = /^(ldsp|mdf|hdf|veneer):\d{1,2}(:[^\s:][^\s]{0,200})?$/;

/** Настройки раскроя организации с подстановкой типовых. Мусор не принимается. */
export function cuttingSettings(raw: unknown): CuttingSettings {
  const value = (raw ?? {}) as Partial<CuttingSettings> & { sheets?: unknown; texture?: unknown };
  /* Десятые доли миллиметра: пропил 4.4 — обычное число. */
  const tenth = (given: unknown, fallback: number, [min, max]: readonly [number, number]) => {
    const n = Number(given);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : fallback;
  };
  const whole = (given: unknown, [min, max]: readonly [number, number]) => {
    const n = Number(given);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
  };

  const sheets: SheetFormat[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(value.sheets) ? value.sheets.slice(0, 200) : []) {
    const format = (entry ?? {}) as Partial<SheetFormat>;
    const stock = typeof format.stock === 'string' ? format.stock.trim() : '';
    const a = whole(format.lengthMm, SHEET_SIDE_RANGE_MM);
    const b = whole(format.widthMm, SHEET_SIDE_RANGE_MM);
    if (!SHEET_STOCK_KEY.test(stock) || a === null || b === null || seen.has(stock)) continue;
    seen.add(stock);
    sheets.push({ stock, lengthMm: Math.max(a, b), widthMm: Math.min(a, b) });
  }

  const texture: Record<string, 'grain' | 'plain'> = {};
  if (value.texture && typeof value.texture === 'object' && !Array.isArray(value.texture)) {
    for (const [stock, mode] of Object.entries(value.texture as Record<string, unknown>).slice(0, 200)) {
      if (SHEET_STOCK_KEY.test(stock) && (mode === 'grain' || mode === 'plain')) texture[stock] = mode;
    }
  }

  return {
    kerfMm: tenth(value.kerfMm, TYPICAL_CUTTING.kerfMm, KERF_RANGE_MM),
    trimMm: tenth(value.trimMm, TYPICAL_CUTTING.trimMm, TRIM_RANGE_MM),
    minRemnantMm: whole(value.minRemnantMm, MIN_REMNANT_RANGE_MM) ?? TYPICAL_CUTTING.minRemnantMm,
    rotate: value.rotate === undefined ? TYPICAL_CUTTING.rotate : value.rotate === true,
    sheets,
    texture,
    confirmed: value.confirmed === true,
  };
}

/** Самая узкая полоса столешницы перед препятствием, при которой плита ещё вырезается. */
export type CountertopStrip = {
  /** Полоса плиты перед препятствием, мм: не уже — вырез, уже — разрыв. */
  minStripMm: number;
  /** Цех подтвердил это число. Нет — «не подтверждено цехом». */
  confirmed: boolean;
};

/** Типовая полоса — 300 мм, и она названа неподтверждённой, пока цех не поставит галочку. */
export const DEFAULT_COUNTERTOP_STRIP: CountertopStrip = { minStripMm: 300, confirmed: false };

/** Границы физические: полосы шире самой плиты не бывает. */
export const COUNTERTOP_STRIP_RANGE_MM = [0, 900] as const;

/** Полоса столешницы организации с подстановкой типовой. Мусор не принимается. */
export function countertopStrip(raw: unknown): CountertopStrip {
  const value = (raw ?? {}) as Partial<CountertopStrip>;
  const strip = Number(value.minStripMm);
  return {
    minStripMm:
      Number.isFinite(strip) && strip >= COUNTERTOP_STRIP_RANGE_MM[0] && strip <= COUNTERTOP_STRIP_RANGE_MM[1]
        ? Math.round(strip)
        : DEFAULT_COUNTERTOP_STRIP.minStripMm,
    confirmed: value.confirmed === true,
  };
}

/**
 * РАЗМЕРЫ УГЛА.
 *
 * Фальш-панель 50–100 мм, нижний Г-образный модуль 900×900 или 1000×1000,
 * верхний Г-образный 600×600. Это ТИПОВЫЕ размеры, а не стандарт цеха:
 * `confirmed` ставит человек, и пока её нет, интерфейс говорит «не
 * подтверждено цехом» рядом с каждым числом.
 */
export type CornerSizes = {
  /** Ширина фальш-панели между рядами, мм: 50…100. */
  falsePanelMm: number;
  /** Сторона нижнего Г-образного модуля, мм. */
  lowerLMm: 900 | 1000;
  /** Сторона верхнего Г-образного модуля, мм. */
  upperLMm: 600;
  /** Цех подтвердил эти числа. Нет — «не подтверждено цехом». */
  confirmed: boolean;
};

/**
 * Типовые размеры угла. Фальш-панель 100 и Г-модуль 900 — те самые числа,
 * что стояли константами (`CORNER.falsePanelMm`, `CORNER_SIZE_MM`): угловые
 * кухни, собранные до настройки, не едут ни на миллиметр.
 */
export const DEFAULT_CORNER_SIZES: CornerSizes = {
  falsePanelMm: 100,
  lowerLMm: 900,
  upperLMm: 600,
  confirmed: false,
};

/** Границы фальш-панели: уже 50 — не пройдёт ручка, шире 100 — это уже модуль. */
export const FALSE_PANEL_RANGE_MM = [50, 100] as const;

/** Размеры угла организации с подстановкой типовых. Мусор не принимается. */
export function cornerSizes(raw: unknown): CornerSizes {
  const value = (raw ?? {}) as Partial<CornerSizes>;
  const panel = Number(value.falsePanelMm);
  return {
    falsePanelMm:
      Number.isFinite(panel) && panel >= FALSE_PANEL_RANGE_MM[0] && panel <= FALSE_PANEL_RANGE_MM[1]
        ? Math.round(panel)
        : DEFAULT_CORNER_SIZES.falsePanelMm,
    lowerLMm: value.lowerLMm === 1000 ? 1000 : 900,
    upperLMm: 600,
    confirmed: value.confirmed === true,
  };
}

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

/**
 * ОТМЕТКИ ОБЪЕКТА — ТОЛЬКО ТО, ЧТО МЕБЕЛЬЩИК ИЗМЕНИЛ.
 *
 * На объекте потолок ниже, фартук другой, цоколь иной — и править их
 * приходится здесь, а не на всю организацию. Но хранить объекту КОПИЮ
 * всего набора нельзя: цех однажды поменяет свой стандарт (перейдёт с
 * боковины 720 на 760), и объекты, собранные до этого, замрут на старом
 * числе — молча, без единого следа в интерфейсе. Раскрой у них поедет
 * не тогда, когда человек что-то решил, а тогда, когда никто ничего не
 * трогал.
 *
 * Поэтому объект хранит ТОЛЬКО изменённое. Всё остальное отсутствует —
 * и читается у организации, следуя за её настройкой.
 *
 * Правится ровно то, что принадлежит месту: высоты цоколя, боковины,
 * столешницы и фартука и три глубины. Толщины, зазоры, припуски и кромка
 * остаются школой ЦЕХА — они про то, как пилят, а не про то, где стоит.
 * Шаг присадки 32 и угловой модуль 900×900 не правятся нигде вовсе.
 */
export type ProductionOverrides = {
  heights?: Partial<RowHeights>;
  depths?: Partial<RowDepths>;
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
    /*
     * Размеры угла пишутся, только если компания их заводила: пусто —
     * типовые, и угловые кухни, собранные раньше, читаются как прежде.
     */
    ...(value.corner ? { corner: cornerSizes(value.corner) } : {}),
    /* Полоса столешницы — так же: не заводили — типовая, с пометкой. */
    ...(value.countertopStrip ? { countertopStrip: countertopStrip(value.countertopStrip) } : {}),
    /* Раскрой листов (CUT-01) — так же: не заводили — типовые числа без форматов. */
    ...(value.cutting ? { cutting: cuttingSettings(value.cutting) } : {}),
    /* Правила короба ящика (HARDWARE-01): только заведённые и целые — иначе правил нет. */
    ...(drawerBoxSettings(value.drawerBox) ? { drawerBox: drawerBoxSettings(value.drawerBox)! } : {}),
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
