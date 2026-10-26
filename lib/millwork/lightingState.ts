/**
 * ОСВЕЩЕНИЕ КОМНАТЫ (V3D-02) — ТО, ЧТО ХРАНИТСЯ В ОБЪЕКТЕ.
 *
 * Типы изделий и предпросмотра, ключи включения и разбор сохранённого
 * (`normalizeLighting`). Отдельным модулем ради первой загрузки: рабочему
 * месту нужен только разбор `MillworkState.lighting`, а геометрия трека,
 * планы источников и сценарии (`lighting.ts`) едут со сценой и панелью.
 * `lighting.ts` переэкспортирует этот модуль — источник один.
 */

/** Пресеты температуры предпросмотра. По фото точную температуру не определить — это ориентир. */
export type LightKelvin = 2700 | 3000 | 4000 | 5000;
export const KELVINS: readonly LightKelvin[] = [2700, 3000, 4000, 5000];
export const KELVIN_TITLE: Record<LightKelvin, string> = {
  2700: '2700 K — тёплый',
  3000: '3000 K — тёплый белый',
  4000: '4000 K — нейтральный',
  5000: '5000 K — холодный',
};
/** Стартовый свет: тёплый белый — ближе всего к фото кухни владельца по восприятию. */
export const DEFAULT_KELVIN: LightKelvin = 3000;

/** Модель трека по фото: ключ, головки, луч — то, что разбор сохранённого обязан знать. */
export const TRACK_MODEL_KEY = 'track-black-780-3' as const;
export type TrackModelKey = typeof TRACK_MODEL_KEY;
/** Головок у изделия с фото. */
export const TRACK_HEADS = 3;
/** Визуальная конфигурация — до шести; больше трёх — не исходный товар 780 мм. */
export const TRACK_MAX_HEADS = 6;
/** Угол луча предпросмотра по умолчанию, градусы (условно). */
export const TRACK_BEAM_DEG = 36;
/** Пределы угла луча предпросмотра, градусы. */
export const BEAM_RANGE: readonly [number, number] = [15, 60];

export type TrackHead = {
  /** Поворот стойки вокруг вертикали, градусы: 0 — к стене привязки. */
  panDeg: number;
  /** Наклон корпуса от вертикали, градусы: 0 — вниз, 90 — горизонтально. */
  tiltDeg: number;
};

export type TrackFixture = {
  id: string;
  kind: 'track';
  model: TrackModelKey;
  /** Стена привязки (`wallId` замера): трек едет с комнатой, а не с мебелью. */
  wallId: string;
  /** Центр трека по стене от её начального угла, мм. */
  alongMm: number;
  /** От внутренней грани стены в комнату, мм. */
  outMm: number;
  /** Поворот шинопровода относительно стены, градусы: 0 — вдоль стены. */
  rotationDeg: number;
  heads: TrackHead[];
  /** Яркость предпросмотра, %. Мощности у изделия нет — это не ватты. */
  brightness: number;
  kelvin: LightKelvin;
  /** Угол луча предпросмотра, градусы (условно). */
  beamDeg: number;
};

/** Лента с профилем под верхними шкафами: подсветка фартука и столешницы. */
export type UnderCabinetFixture = {
  id: 'under-cabinet';
  kind: 'under_cabinet';
  /** Где лента под дном шкафа: у фасада — свет на столешницу, у стены — на фартук. */
  placement: 'front' | 'back';
  /** Отступ ленты от торцов каждого участка, мм: так задаётся длина линии. */
  insetMm: number;
  brightness: number;
  kelvin: LightKelvin;
};

/** Лента внутри модуля: шкаф, открытая полка, ниша. Не изделие сметы — подсветка предпросмотра. */
export type ModuleLedFixture = {
  id: string;
  kind: 'module_led';
  moduleId: string;
  /** Под крышей у фасада — или под каждой полкой. */
  mode: 'top' | 'shelves';
  brightness: number;
  kelvin: LightKelvin;
};

export type LightFixture = TrackFixture | UnderCabinetFixture | ModuleLedFixture;

/**
 * Настройка ленты ВИТРИНЫ: сама лента — изделие модуля (строка `led_display`),
 * здесь только её свет. Раскладка ленты с P1 — тоже изделие (`VitrineSpec.led`,
 * её считает смета); `mode` — прежний предпросмотр у витрин до P1 без своей
 * раскладки: сцена показывает его, пока человек не выбрал раскладку изделия.
 */
export type DisplayLight = { brightness: number; kelvin: LightKelvin; mode?: 'contour' | 'shelves' };

export type LightingAmbient = 'day' | 'evening' | 'night';

export type LightingPreview = {
  /** Режим «Интерьер»: свет, стекло и материалы вместо САПР-вида. */
  design: boolean;
  ambient: LightingAmbient;
  /** Потолок показан. Высота — из замера. */
  ceiling: boolean;
  /**
   * Что включено. Ключа нет — как велит сцена (днём выключено, вечером и
   * ночью включено); есть — выбор человека, и сцена его не перебивает.
   */
  on: Record<string, boolean>;
};

export type RoomLighting = {
  fixtures: LightFixture[];
  displays: Record<string, DisplayLight>;
  preview: LightingPreview;
};

export const EMPTY_LIGHTING: RoomLighting = {
  fixtures: [],
  displays: {},
  preview: { design: false, ambient: 'day', ceiling: true, on: {} },
};

/* ── ключи источников ── */

export const trackKey = (fixture: Pick<TrackFixture, 'id'>) => fixture.id;
export const headKey = (fixture: Pick<TrackFixture, 'id'>, index: number) => `${fixture.id}#${index}`;
export const UNDER_CABINET_KEY = 'under-cabinet';
export const displayKey = (moduleId: string) => `display:${moduleId}`;
export const moduleLedKey = (moduleId: string) => `module-led:${moduleId}`;

/* ── разбор сохранённого: мусор не превращается ни в свет, ни в NaN ── */

const clamp = (value: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(lo, Math.min(hi, n));
};
const kelvinOf = (value: unknown): LightKelvin => (KELVINS.includes(value as LightKelvin) ? (value as LightKelvin) : DEFAULT_KELVIN);

/**
 * СОХРАНЁННОЕ ОСВЕЩЕНИЕ → РАБОЧЕЕ. Неизвестный вид изделия отбрасывается,
 * числа зажимаются в пределы, отсутствующее — по умолчанию. Пусто и
 * невалидно — `null`: у объекта освещения нет, и сцена прежняя.
 */
export function normalizeLighting(raw: unknown): RoomLighting | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<RoomLighting> & { fixtures?: unknown[]; displays?: Record<string, unknown> };
  const fixtures: LightFixture[] = [];
  const ids = new Set<string>();
  for (const item of Array.isArray(source.fixtures) ? source.fixtures : []) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Partial<TrackFixture> & Partial<UnderCabinetFixture> & Partial<ModuleLedFixture>;
    if (f.kind === 'track' && typeof f.id === 'string' && typeof f.wallId === 'string' && !ids.has(f.id)) {
      ids.add(f.id);
      const heads = Array.isArray(f.heads) ? f.heads : [];
      const count = Math.max(TRACK_HEADS, Math.min(TRACK_MAX_HEADS, heads.length || TRACK_HEADS));
      fixtures.push({
        id: f.id,
        kind: 'track',
        model: TRACK_MODEL_KEY,
        wallId: f.wallId,
        alongMm: clamp(f.alongMm, 0, 20000, 0),
        outMm: clamp(f.outMm, 100, 10000, 700),
        rotationDeg: clamp(f.rotationDeg, -180, 180, 0),
        heads: Array.from({ length: count }, (_, i) => ({
          panDeg: clamp((heads[i] as TrackHead | undefined)?.panDeg, -180, 180, 0),
          tiltDeg: clamp((heads[i] as TrackHead | undefined)?.tiltDeg, 0, 90, 25),
        })),
        brightness: clamp(f.brightness, 5, 100, 80),
        kelvin: kelvinOf(f.kelvin),
        beamDeg: clamp(f.beamDeg, BEAM_RANGE[0], BEAM_RANGE[1], TRACK_BEAM_DEG),
      });
    }
    if (f.kind === 'under_cabinet' && !ids.has(UNDER_CABINET_KEY)) {
      ids.add(UNDER_CABINET_KEY);
      fixtures.push({
        id: UNDER_CABINET_KEY,
        kind: 'under_cabinet',
        placement: f.placement === 'back' ? 'back' : 'front',
        insetMm: clamp(f.insetMm, 0, 200, 0),
        brightness: clamp(f.brightness, 5, 100, 70),
        kelvin: kelvinOf(f.kelvin),
      });
    }
    if (f.kind === 'module_led' && typeof f.moduleId === 'string' && !ids.has(moduleLedKey(f.moduleId))) {
      ids.add(moduleLedKey(f.moduleId));
      fixtures.push({
        id: moduleLedKey(f.moduleId),
        kind: 'module_led',
        moduleId: f.moduleId,
        mode: f.mode === 'shelves' ? 'shelves' : 'top',
        brightness: clamp(f.brightness, 5, 100, 70),
        kelvin: kelvinOf(f.kelvin),
      });
    }
  }
  const displays: Record<string, DisplayLight> = {};
  for (const [moduleId, value] of Object.entries(source.displays ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Partial<DisplayLight>;
    displays[moduleId] = {
      brightness: clamp(v.brightness, 5, 100, 70),
      kelvin: kelvinOf(v.kelvin),
      /* Прежний предпросмотр раскладки (до P1) — как сохранён; нет — нет поля. */
      ...(v.mode === 'shelves' || v.mode === 'contour' ? { mode: v.mode } : {}),
    };
  }
  const p = (source.preview ?? {}) as Partial<LightingPreview>;
  const on: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(p.on ?? {})) if (typeof value === 'boolean') on[key] = value;
  const preview: LightingPreview = {
    design: p.design === true,
    ambient: p.ambient === 'evening' || p.ambient === 'night' ? p.ambient : 'day',
    ceiling: p.ceiling !== false,
    on,
  };
  if (fixtures.length === 0 && Object.keys(displays).length === 0 && !preview.design) return null;
  return { fixtures, displays, preview };
}

