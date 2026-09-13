/**
 * Конфигуратор корпусной мебели.
 *
 * ГЛАВНОЕ ПРАВИЛО СЛОЯ: ни одно число в смете и чертеже не приходит от модели.
 * Gemini предлагает РАСКЛАДКУ (какие модули, в каком порядке), код валидирует,
 * сажает на стандартные ширины, считает BOM и строит чертёж.
 *
 * Внутри движка мебели — ЦЕЛЫЕ МИЛЛИМЕТРЫ. Метры появляются только на экране
 * 3D-сцены: одна раскладка обязана давать одну смету при любом числе
 * пересчётов, а плавающая точка этого не гарантирует.
 */

/* ─────────────────────────  Замер  ───────────────────────── */

export type OpeningKind =
  | 'window'
  | 'door'
  | 'arch'
  | 'niche'
  | 'column'
  | 'pipe_box';

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** Расстояние от левого угла стены до левого края проёма. */
  fromCornerMm: number;
  widthMm: number;
  /** Низ проёма от пола. Для двери 0. */
  sillMm: number;
  heightMm: number;
  /** Насколько выступает или углубляется — для ниш, коробов и колонн. */
  depthMm?: number;
}

export type CommKind =
  | 'water_supply'
  | 'sewer'
  | 'gas'
  | 'ventilation'
  | 'socket'
  | 'switch'
  | 'radiator';

export interface CommPoint {
  id: string;
  kind: CommKind;
  wallId: string;
  fromCornerMm: number;
  heightMm: number;
  note?: string;
}

/**
 * Стены задаются цепочкой сегментов с углами, а не парой «ширина × длина»:
 * реальные помещения бывают П-образными, с эркерами и коробами.
 */
export interface WallSegment {
  id: string;
  lengthMm: number;
  /** Поворот к следующему сегменту, в градусах. 90 — обычный внутренний угол. */
  angleDeg: number;
  openings: Opening[];
}

export interface Measurement {
  id: string;
  ceilingHeightMm: number;
  walls: WallSegment[];
  comms: CommPoint[];
  photos: string[];
  measuredBy: string;
  measuredAt: string;
  notes: string;
}

/* ─────────────────────────  Модули  ───────────────────────── */

export type ModuleKind =
  | 'base'
  | 'upper'
  | 'tall'
  | 'corner_base'
  | 'corner_upper'
  | 'filler';

export type ApplianceKind =
  | 'oven'
  | 'hob'
  | 'hood'
  | 'dishwasher45'
  | 'dishwasher60'
  | 'sink600'
  | 'sink800'
  | 'fridge'
  | 'microwave';

export type FrontType = 'door' | 'drawers' | 'none' | 'appliance';

/** Начинка конкретного места. Каталог — в lib/millwork/moduleVariants.ts. */
export type ModuleVariantKind =
  | 'door'
  | 'door_two'
  | 'drawers'
  | 'drawers_four'
  | 'drawers_door'
  | 'cargo'
  | 'bottle'
  | 'sink_base'
  | 'hob_base'
  | 'corner_carousel'
  | 'open_base'
  | 'upper_door'
  | 'upper_glass'
  | 'upper_display'
  | 'upper_dryer'
  | 'upper_lift'
  | 'upper_open'
  | 'upper_micro'
  | 'tall_shelves'
  | 'tall_cargo'
  | 'tall_rod'
  | 'tall_oven_micro'
  | 'tall_fridge'
  | 'tall_display';

/**
 * Секция — это НАЧИНКА модуля в зонах, где нет техники.
 *
 * У кухни роль модуля задаёт прибор: мойка, варочная, духовка. В спальне и
 * прихожей приборов нет, а разница между модулями решает всё: штанга под
 * пальто требует 1500 мм высоты, полки — 350 мм шага, ящики — своей
 * фурнитуры. Без секции ряд превратился бы в набор одинаковых коробок,
 * а смета — в один корпус ЛДСП.
 */
export type SectionKind =
  // Спальня
  | 'hanging_long'
  | 'hanging_double'
  | 'shelves'
  | 'drawers'
  | 'open'
  | 'mezzanine'
  // Прихожая
  | 'hooks'
  | 'shoes'
  | 'bench'
  | 'mirror'
  // Зал
  | 'tv_niche'
  | 'hanging_module'
  // Кухня и зал
  | 'glass_display'
  // Санузел
  | 'vanity'
  | 'tall_unit'
  | 'mirror_cabinet';

/** Чем закрывается зона: распашными фасадами или дверями-купе. */
export type DoorSystem = 'hinged' | 'sliding';

/**
 * Два прибора в одном пенале, один над другим.
 *
 * Это то, что мебельщик ставит чаще всего и чего конфигуратор не умел
 * вовсе: духовка и микроволновка в одной высокой колонне. По умолчанию
 * микроволновка сверху — так ей пользуются, не приседая.
 */
export interface ApplianceColumn {
  moduleId: string;
  top: 'microwave' | 'oven';
  bottom: 'microwave' | 'oven';
}

/**
 * Холодильник встроенный или отдельностоящий.
 *
 * Разница в цене заметная — фасад и петли для встройки, — поэтому это
 * отдельные строки сметы, а не косметика. По умолчанию встроенный.
 */
export type FridgeType = 'built_in' | 'freestanding';

/**
 * Что внутри модуля.
 *
 * Пустой прямоугольник с шириной — это визуализатор. Отсюда считается
 * детализировка, которую технолог сегодня пишет руками час на заказ.
 *
 * Все высоты — от ДНА КОРПУСА, в миллиметрах, и все положения полок
 * проходят через `snapTo32`: полка садится только на присадочное отверстие.
 */
export interface ModuleFill {
  /** Горизонтальные полки: высота от дна корпуса, мм. */
  shelves: number[];
  /** Вертикальная перегородка: смещение от левого края, мм. Ноль — нет. */
  dividerMm: number;
  /**
   * Штанги: высота от дна, мм. Массив, а не одно число: секция «две штанги»
   * это 1900 и 950 в одном модуле, и терять вторую нельзя.
   */
  rodsMm: number[];
  /** Высоты фронтов ящиков сверху вниз, мм. Сумма равна высоте модуля. */
  drawerHeights: number[];
  /**
   * Куда открывается фасад. По этому полю цех сверлит петли и заказывает
   * механизм, чертёж рисует диагональ или дугу, а смета берёт фурнитуру.
   *
   * Поле называется `hinge` с тех пор, когда направлений было два. Имя
   * осталось: его читают сохранённые объекты, а переименование ради
   * красоты стоило бы миграции на ровном месте.
   */
  hinge: FrontOpening;
  /**
   * Направление выбрал человек, а не вывело умолчание.
   *
   * Это ПРОВЕНАНС, а не величина: подъёмник и петля различаются полем
   * `hinge`, и на числа этот флаг не влияет — в отпечаток он поэтому не
   * входит. Нужен он ровно для одного: не молчать. Пока направление не
   * выбрано, смета говорит, что посчитала его по умолчанию; выбрано —
   * замолкает, потому что спрашивать больше не о чем.
   */
  openingChosen?: boolean;
  /**
   * ЧЕМ ОТКРЫВАЮТ: скоба, профиль или нажатие.
   *
   * Это разная фурнитура и разные деньги, поэтому выбор лежит на модуле,
   * а не один на весь ряд. Пусто — ручка по умолчанию ряда
   * (`options.integratedHandles`): у рядов, собранных до этого выбора,
   * ничего не меняется и отпечаток не едет.
   */
  handle?: HandleKind;
}

/**
 * ТРИ СПОСОБА ОТКРЫТЬ ФАСАД.
 *
 * `bar` — накладная скоба, `profile` — врезная ручка-профиль по кромке,
 * `none` — без ручки, нажатием (push-to-open). Последнее не «ничего»: за
 * ним стоит механизм, и в смете он идёт своей строкой.
 */
export type HandleKind = 'bar' | 'profile' | 'none';

/**
 * НАПРАВЛЕНИЕ ОТКРЫВАНИЯ.
 *
 * Пять значений вместо двух сторон петель: подъёмник и откидной — это
 * другая фурнитура и другие деньги, а не оттенок той же дверцы. Газлифт
 * стоит в разы дороже петли, поэтому «верхний ряд — значит подъёмник»
 * было не упрощением, а лишними тысячами в смете каждого заказа.
 *
 * `none` — распашного фасада нет вовсе: ящики, открытая секция,
 * отдельностоящий прибор.
 */
export type FrontOpening = 'left' | 'right' | 'lift' | 'flap' | 'double' | 'none';

/**
 * МАТЕРИАЛ ФАСАДА: три независимых атрибута.
 *
 * Независимы не до конца — ЛДСП не гнётся, эмаль не кромится, — и все
 * правила живут в одном месте: `lib/millwork/frontMaterial.ts`.
 */
export type FrontBase = 'ldsp' | 'mdf_film' | 'mdf_enamel' | 'acrylic' | 'veneer_solid';
export type FrontConstruct = 'solid' | 'framed' | 'radius';
export type FrontFinish = 'gloss' | 'matte' | 'textured';

export interface FrontSpec {
  base: FrontBase;
  construct: FrontConstruct;
  finish: FrontFinish;
  /** Цвет из каталога, `#rrggbb`. Пусто — цвет по умолчанию. */
  colorHex?: string;
  /** Артикул каталога компании. По нему выноска называет товар. */
  itemId?: string;
}

/**
 * РАЗМЕРЫ КОНКРЕТНОГО ПРИБОРА.
 *
 * `APPLIANCE_SLOTS` держит отраслевой стандарт — с него и начинается
 * разговор. Но приборы у клиентов разные: холодильник бывает 550, 600,
 * 700 и side-by-side 900, духовка под столешницу и в колонну — разной
 * высоты. Габарит берётся отсюда, а ЗАЗОРЫ вокруг него остаются
 * отраслевыми: их считает код, а не человек.
 */
export interface ApplianceSize {
  widthMm: number;
  /** Высота корпуса прибора. Из неё считается ниша. */
  heightMm?: number;
  depthMm?: number;
}

export interface Module {
  id: string;
  kind: ModuleKind;
  widthMm: number;
  /** Положение левого края модуля от левого края ряда. */
  offsetMm: number;
  appliance?: ApplianceKind;
  frontType: FrontType;
  /** Число ящиков, если frontType='drawers'. */
  drawerCount: number;
  /** Число дверей, если frontType='door'. */
  doorCount: number;
  /** Ширина не из списка стандартов — доборный. */
  isFiller: boolean;
  /** Начинка модуля в зонах без техники. У кухни её нет. */
  section?: SectionKind;
  /** Что внутри: полки, штанги, ящики, сторона петель. */
  fill?: ModuleFill;
  /** Два прибора в одном пенале: духовка и микроволновка. */
  column?: ApplianceColumn;
  /**
   * Начинка места: карго, под мойку, сушилка, подъёмник, стекло.
   *
   * Это НЕ новый тип модуля: ширину и позицию по-прежнему считает
   * раскладка. Вариант решает, что стоит в этом конкретном месте —
   * ровно так же, как в цеху.
   */
  variant?: ModuleVariantKind;
  /**
   * Техника закрыта фасадом заподлицо. У отдельностоящего холодильника
   * фасада нет вовсе — ни в 3D, ни в смете, ни в детализировке.
   */
  builtIn?: boolean;
  /**
   * Материал фасада ЭТОГО модуля.
   *
   * Пусто — фасад по умолчанию (ЛДСП, цельный, мат): так выглядят все
   * ряды, собранные до появления материалов, и отпечаток у них не меняется.
   * Верх и низ могут отличаться — готовые дизайны этим и пользуются.
   */
  front?: FrontSpec;
  /**
   * Размеры приборов, введённые руками, — ПО ПРИБОРУ, а не по модулю.
   *
   * В колонне приборов ДВА, и габариты у них разные: духовка 595, а
   * микроволновка 380. Один набор на модуль давал им одну нишу на двоих —
   * микроволновка получала духовочную высоту, и в пенале появлялось
   * пустое место на двадцать сантиметров.
   *
   * Пусто — отраслевой стандарт из `APPLIANCE_SLOTS`.
   */
  applianceSizes?: Partial<Record<ApplianceKind, ApplianceSize>>;
  label: string;
}

/**
 * Деталь для цеха.
 *
 * То, что технолог сегодня выписывает руками: размер, количество, на какие
 * торцы клеится кромка и куда идёт текстура. Без направления текстуры
 * раскрой считается неверно.
 */
export interface Panel {
  moduleId: string;
  moduleLabel: string;
  /** «Боковина», «Полка», «Дно», «Фасад». */
  name: string;
  /** «ЛДСП 16», «ХДФ 3», «Фасад 18». */
  material: string;
  lengthMm: number;
  widthMm: number;
  qty: number;
  /** На сколько торцов клеится кромка: Д — длинные, Ш — короткие. */
  edges: { long: number; short: number };
  edgeType: '0.4' | '1' | '2';
  /** Направление текстуры: вдоль длины, поперёк или без текстуры. */
  grain: 'along' | 'across' | 'none';
}

export interface PanelTotals {
  count: number;
  ldspM2: number;
  hdfM2: number;
  frontM2: number;
  /** Погонные метры видимой кромки. */
  edgeThickM: number;
  /** Погонные метры скрытой кромки 0.4 мм. */
  edgeThinM: number;
}

/** Непрерывный кусок верхнего ряда: между разрывами над окнами. */
export interface UpperSegment {
  fromMm: number;
  toMm: number;
  modules: Module[];
}

export type HardwareClass = 'standard' | 'soft_close' | 'blum';
export type CountertopKind = 'ldsp' | 'quartz' | 'solid_wood';

export interface RunOptions {
  hasUpper: boolean;
  upperToCeiling: boolean;
  hardwareClass: HardwareClass;
  countertop: CountertopKind;
  /** Антресоль — второй ярус верхнего ряда до потолка. */
  hasCornice: boolean;
  integratedHandles: boolean;
}

/**
 * Зона квартиры. Полностью просчитана кухня; остальные заведены габаритами
 * и составом статей — см. lib/millwork/zones.ts.
 */
export type ZoneKind = 'kitchen' | 'bedroom' | 'living' | 'bathroom' | 'hallway';

export interface Run {
  id: string;
  /** Зона, под которую собран ряд. По умолчанию кухня. */
  zone?: ZoneKind;
  /** Чем закрыт ряд. Двери-купе считаются по м² и меняют глубину корпуса. */
  doorSystem?: DoorSystem;
  /** Длина ряда по стене. */
  lengthMm: number;
  ceilingHeightMm: number;
  modules: Module[];
  upperSegments: UpperSegment[];
  options: RunOptions;
  /**
   * Антресоль над верхним рядом. Пусто — её нет вовсе.
   *
   * Живёт на ряду, а не в требованиях: `applyOps` пересобирает верхний
   * ряд после каждой правки, и антресоль обязана пережить пересборку
   * вместе со своим материалом.
   */
  mezzanine?: MezzanineSpec;
  /** Сумма ширин и зазоров минус длина ряда. Обязана быть нулевой. */
  residualMm: number;
  warnings: string[];
  /** Отпечаток состава: по нему сверяются чертёж, смета и рендер. */
  fingerprint: string;
}

/* ─────────────────────────  Композиция  ───────────────────────── */

/**
 * ФОРМА ГАРНИТУРА.
 *
 * `Run` — это ОДИН ПРЯМОЙ РЯД вдоль одной стены, и таким он остаётся.
 * Угловая кухня — это два таких ряда, соединённых углом; П-образная — три.
 * Композиция их связывает, а раскладку каждого по-прежнему считает
 * `buildRun`: вторая ветка раскладки разошлась бы с первой на первой же
 * правке, и клиент увидел бы не ту мебель, что цех.
 */
export type CompositionKind = 'linear' | 'corner_l' | 'u_shape';

export interface RunSegment {
  id: string;
  /**
   * Приборы ЭТОЙ стены.
   *
   * Композиция раздаёт приборы по стенам, и раздача обязана быть видна
   * снаружи: рабочее место собирает стену А своими средствами, и без
   * этого списка оно собирало её из ПОЛНОГО набора — холодильник
   * появлялся дважды.
   */
  appliances: ApplianceKind[];
  /** Метка для чертежа и разговора: «Стена А», «Стена Б». */
  label: string;
  /** Стена замера, вдоль которой стоит ряд. */
  wallId: string;
  /** Поворот относительно предыдущего сегмента. Для Г-образной 90. */
  angleDeg: number;
  /** Полная длина стены: из неё вычитается глубина соседнего ряда. */
  wallLengthMm: number;
  run: Run;
}

/**
 * Как решён угол.
 *
 * Фальш-панель нужна не для красоты: без неё фасад углового модуля при
 * открывании упирается в перпендикулярный фасад. Панель отодвигает его,
 * а петли на 155° или 175° дают двери раскрыться.
 */
export interface CornerJoin {
  fromSegmentId: string;
  toSegmentId: string;
  solution: 'corner_module' | 'false_panel';
  /** Ширина фальш-панели, мм. */
  falsePanelMm?: number;
  /** Угол раскрытия петли. */
  hingeAngleDeg?: 155 | 175;
  /** Зазор фасада у угла, мм: там он больше обычного. */
  frontGapMm: number;
}

/**
 * АНТРЕСОЛЬ — САМОСТОЯТЕЛЬНЫЙ ЭЛЕМЕНТ, А НЕ СВОЙСТВО ВЕРХНЕГО РЯДА.
 *
 * Мебельщик продаёт её отдельной позицией: у неё своя высота, свой
 * материал и своя цена, и заказывают её не всегда. Пока она была
 * признаком верхнего ряда, ни выбрать ей материал, ни снять её отдельно
 * было нельзя.
 */
export interface MezzanineSpec {
  /** Своя высота корпуса, мм. Пусто — отраслевая из спецификации секции. */
  heightMm: number;
}

export interface Composition {
  kind: CompositionKind;
  segments: RunSegment[];
  corners: CornerJoin[];
  /** Отпечаток всей композиции: по нему сверяются чертёж, смета, 3D и рендер. */
  fingerprint: string;
  /** Что не собралось: стена короче глубины соседа, прибор не поместился. */
  warnings: string[];
}

/**
 * КАК СОБИРАЕТСЯ РЯД.
 *
 *   template — раскладку считает `buildRun` по составу техники, и сумма
 *              ширин ОБЯЗАНА сойтись со стеной до миллиметра. Так работает
 *              быстрый старт из готового решения.
 *   free     — ряд собирает человек: добавляет модули, удаляет, тянет
 *              ширину. Место после удаления НЕ перезаполняется, и ряд
 *              имеет право не сходиться — незаполненный остаток это не
 *              ошибка, а «ещё не собрано».
 *
 * Ответ мебельщику на «сможешь сделать мой дизайн» — это `free`.
 */
export type RunMode = 'template' | 'free';

export interface RunRequirements {
  /** Размеры приборов клиента: холодильник 700, side-by-side 900. */
  applianceSizes?: Partial<Record<ApplianceKind, ApplianceSize>>;
  /** Зона квартиры: от неё зависят габариты и состав статей сметы. */
  zone?: ZoneKind;
  /**
   * Свободная сборка. По умолчанию `template` — старое поведение слово
   * в слово: шаблоны и всё, что на них построено, не замечают этого поля.
   */
  mode?: RunMode;
  /**
   * Позиции, заданные замерщиком вручную: прибор → центр от левого края, мм.
   *
   * Алгоритм ставит мойку к воде, варочную не у края, холодильник в торец —
   * это верные умолчания. Но на объекте замерщик видит то, чего алгоритм не
   * знает: газовый вывод в другом месте, у хозяйки своё представление о том,
   * где стоять плите. Ручная позиция — сознательное решение человека,
   * поэтому она сильнее любого умолчания.
   */
  manualAnchors?: Partial<Record<ApplianceKind, number>>;
  /** Состав секций для зон без техники. Пусто — берётся состав по умолчанию. */
  sections?: SectionKind[];
  /**
   * Что стоит сверху в колонне «духовка + микроволновка». Верх и низ
   * меняются кнопкой на выбранной колонне, и отпечаток конфигурации от
   * этого меняется: это другая мебель.
   */
  columnTop?: 'microwave' | 'oven';
  /** Встроенный холодильник или отдельностоящий. По умолчанию встроенный. */
  fridgeType?: FridgeType;
  /**
   * НА КАКОЙ СТЕНЕ СТОИТ ПРИБОР.
   *
   * Приборы принадлежат КУХНЕ, а не ряду: холодильник один, и стоит он
   * на одной стене. Пусто — стену выбирает раскладка (`splitAppliances`)
   * по рабочему треугольнику; выбрал человек — его выбор сильнее.
   *
   * Ключ — прибор, значение — номер стены композиции.
   */
  applianceWalls?: Partial<Record<ApplianceKind, number>>;
  /**
   * ИСПОЛНЕНИЕ ПРИБОРА: газовая или электрическая, встроенная или
   * отдельностоящая, наклонная или купольная.
   *
   * Это набор умолчаний по габаритам и нише, а не новый прибор: сам
   * `ApplianceKind` остаётся прежним, и списки зон о типах не знают.
   * Замеренный габарит сильнее типа.
   */
  applianceTypes?: Partial<Record<ApplianceKind, string>>;
  /** Витрина со стеклянными полками и подсветкой в торце ряда. */
  glassDisplay?: boolean;
  /** Форма гарнитура: один ряд, угол или П. */
  composition?: CompositionKind;
  /** Чем решать угол. По умолчанию фальш-панель: она дешевле. */
  cornerSolution?: CornerJoin['solution'];
  /**
   * Опции, которые человек выбрал руками.
   *
   * Стратегия комплектации перекрывает опции ряда своими — так «премиум»
   * поднимает верхний ряд до потолка. Но выбор замерщика она перекрывать
   * не вправе: переключатель, который ничего не меняет, читается как
   * сломанный инструмент.
   */
  lockedOptions?: (keyof RunOptions)[];
  /** Двери-купе или распашные. Считается по-разному, стоит по-разному. */
  doorSystem?: DoorSystem;
  appliances: ApplianceKind[];
  /** С какой стороны ставить холодильник и пенал. */
  tallSide: 'left' | 'right';
  options: RunOptions;
}

/* ─────────────────────────  Смета  ───────────────────────── */

export type EstimateUnit = 'm2' | 'mp' | 'pcs' | 'set' | 'percent';

export interface EstimateLine {
  id: string;
  /** Ключ статьи — по нему ищется ставка в каталоге организации. */
  key: string;
  title: string;
  unit: EstimateUnit;
  quantity: number;
  rate: number;
  total: number;
  /** Снята ли галочка. Выключенная строка не входит в итог. */
  enabled: boolean;
  /** Ставка не найдена в каталоге — считали по нулю. */
  missingRate?: boolean;
}

export interface Estimate {
  variant: VariantKey;
  lines: EstimateLine[];
  total: number;
  /** Отпечаток ряда, по которому смета посчитана. */
  fingerprint: string;
  /** Смета опирается на допущения замера — точной она называться не может. */
  preliminary?: boolean;
  /** Снимок ставок на дату расчёта: сохранённая смета не должна «плавать». */
  priceSnapshot: Record<string, number>;
  calculatedAt: string;
}

export type VariantKey = 'basic' | 'optimal' | 'premium';

export interface Variant {
  key: VariantKey;
  title: string;
  description: string;
  run: Run;
  estimate: Estimate;
}

/* ─────────────────────────  Операции AI  ───────────────────────── */

export type MillworkOp =
  /**
   * Добавить модуль. `variant` задаёт НАЧИНКУ сразу: «+» в свободной
   * сборке ставит готовый модуль (карго 400, витрину 600), а не пустое
   * место, которому потом выбирают назначение вторым жестом.
   */
  | {
      op: 'add_module';
      kind: ModuleKind;
      widthMm?: number;
      afterModuleId?: string;
      appliance?: ApplianceKind;
      variant?: ModuleVariantKind;
    }
  | { op: 'remove_module'; moduleId: string }
  | { op: 'replace_module'; moduleId: string; kind: ModuleKind; appliance?: ApplianceKind }
  | { op: 'set_width'; moduleId: string; widthMm: number }
  | { op: 'set_fronts'; moduleId: string; drawerCount: number }
  /** Сменить начинку модуля в зонах без техники: штанга вместо полок. */
  | { op: 'set_section'; moduleId: string; section: SectionKind }
  /** Сменить вариант места: карго вместо дверцы, сушилка над мойкой. */
  | { op: 'set_variant'; moduleId: string; variant: ModuleVariantKind }
  /**
   * Материал фасада. `moduleId: 'all'` — весь ряд: так применяется
   * готовый дизайн, и так же он потом правится поштучно.
   */
  | { op: 'set_front'; moduleId: string; front: FrontSpec }
  /**
   * Габарит КОНКРЕТНОГО прибора: ниша пересчитывается, зазоры остаются
   * отраслевыми. `appliance` обязателен — в колонне приборов два, и
   * «размер модуля» там ничего не значит.
   */
  | {
      op: 'set_appliance_size';
      moduleId: string;
      appliance: ApplianceKind;
      size: ApplianceSize;
    }
  /**
   * Перенос модуля. `afterModuleId` — перестановка в порядке (так правит
   * модель); `offsetMm` — перенос на место вдоль ряда, шагом 50 мм: так
   * двигает модуль рука в свободной сборке. Соседи не раздвигаются.
   */
  | { op: 'move_module'; moduleId: string; afterModuleId?: string; offsetMm?: number }
  /**
   * Антресоль как отдельная позиция состава: добавить со своей высотой
   * либо снять. Материал ей выбирают тем же `set_front`, что и всем.
   */
  | { op: 'set_mezzanine'; heightMm: number | null }
  /**
   * Направление открывания фасада. Ложится в `fill.hinge` — туда же, куда
   * его кладёт умолчание, — и потому одинаково видно чертежу, сцене,
   * раскрою и смете.
   */
  | { op: 'set_opening'; moduleId: string; opening: FrontOpening }
  /** Чем открывают фасад: скоба, профиль или нажатие. */
  | { op: 'set_handle'; moduleId: string; handle: HandleKind }
  | { op: 'set_option'; key: 'upperToCeiling' | 'hardwareClass' | 'countertop' | 'hasUpper' | 'hasCornice' | 'integratedHandles'; value: string | boolean };

export interface MillworkRequest {
  message: string;
  run: Run;
  requirements: RunRequirements;
}

export interface MillworkResponse {
  reply: string;
  ops: MillworkOp[];
}

/* ─────────────────────────  Проверки  ───────────────────────── */

export type IssueLevel = 'error' | 'warning';

/**
 * Что именно не так. Две категории по смыслу разные и показываются
 * в разных местах: поломка раскладки — это баг конфигуратора, а расхождение
 * с коммуникацией — нормальная рабочая ситуация, которую решают на объекте.
 * Смешивать их в один список нельзя: тогда обе выглядят как одна поломка.
 */
export type IssueKind = 'layout' | 'comm' | 'fit';

export interface LayoutIssue {
  kind: IssueKind;
  level: IssueLevel;
  moduleId?: string;
  /** Позиция вдоль ряда, куда указывает флажок на плане. */
  atMm?: number;
  message: string;
}
