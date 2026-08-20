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
  label: string;
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

export interface Run {
  id: string;
  /** Длина ряда по стене. */
  lengthMm: number;
  ceilingHeightMm: number;
  modules: Module[];
  upperSegments: UpperSegment[];
  options: RunOptions;
  /** Сумма ширин и зазоров минус длина ряда. Обязана быть нулевой. */
  residualMm: number;
  warnings: string[];
}

export interface RunRequirements {
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
  | { op: 'add_module'; kind: ModuleKind; widthMm?: number; afterModuleId?: string; appliance?: ApplianceKind }
  | { op: 'remove_module'; moduleId: string }
  | { op: 'replace_module'; moduleId: string; kind: ModuleKind; appliance?: ApplianceKind }
  | { op: 'set_width'; moduleId: string; widthMm: number }
  | { op: 'set_fronts'; moduleId: string; drawerCount: number }
  | { op: 'move_module'; moduleId: string; afterModuleId: string }
  | { op: 'set_option'; key: 'upperToCeiling' | 'hardwareClass' | 'countertop' | 'hasUpper' | 'hasCornice'; value: string | boolean };

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

export interface LayoutIssue {
  level: IssueLevel;
  moduleId?: string;
  /** Позиция вдоль ряда, куда указывает флажок на плане. */
  atMm?: number;
  message: string;
}
