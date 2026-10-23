/**
 * ОСВЕЩЕНИЕ КОМНАТЫ (V3D-02) — ИЗДЕЛИЯ И ПРЕДПРОСМОТР, БЕЗ THREE.
 *
 * Светильник — объект КОМНАТЫ, а не мебели: модулей он не добавляет, ряд,
 * раскрой, смету и отпечаток не трогает. Лежит он в `MillworkState.lighting`
 * — необязательным полем: у объектов без него освещения нет вовсе, и
 * открываются они как раньше (совместимость — чтением, ловушка 295).
 *
 * Два разных вопроса, два места:
 *
 *   изделия      что установлено: трек (стена, мм вдоль, мм от стены,
 *                поворот, наклон каждой головки), лента под верхними
 *                шкафами, лента в модуле; яркость и температура — их
 *                настройка; у ленты витрины (она — изделие модуля и строка
 *                сметы `led_display`) здесь только настройка её света;
 *   предпросмотр как сейчас смотрим: режим «Интерьер», день/вечер/ночь,
 *                потолок, что включено. Выключенная лампа не удаляет
 *                изделие — она просто не светит.
 *
 * Место головки, её луч и сетку в сцене считает одна `trackPose`: корпус
 * спота и источник света стоят в одних и тех же группах сцены, повороты
 * которых — её числа; второй формулы «куда светит» нет.
 *
 * Трек — ВИЗУАЛЬНАЯ РЕКОНСТРУКЦИЯ по описанию фото владельца, а не артикул:
 * в каталоге организации светильников нет, электрических характеристик нет,
 * в смету изделие не идёт — и это сказано словами.
 */
import type { Module, Run } from '@/types/millwork';
import {
  DEFAULT_KELVIN,
  TRACK_BEAM_DEG,
  TRACK_HEADS,
  TRACK_MAX_HEADS,
  TRACK_MODEL_KEY,
  UNDER_CABINET_KEY,
  displayKey,
  moduleLedKey,
  trackKey,
  headKey,
  type DisplayLight,
  type LightKelvin,
  type LightFixture,
  type LightingAmbient,
  type LightingPreview,
  type ModuleLedFixture,
  type RoomLighting,
  type TrackFixture,
  type UnderCabinetFixture,
} from './lightingState';
/* Хранимая часть (типы, ключи, разбор сохранённого) — своим модулем: она в первой загрузке рабочего места. */
export * from './lightingState';
import { rowPlacement, type Room, type RoomWall } from './room';
import { runPlaces } from './cabinetBoxes';
import { variantEstimateKeys } from './moduleVariants';

const MM = 1000;
const DEG = Math.PI / 180;

/* ─────────────────────────  цвет света  ───────────────────────── */

/**
 * ЦВЕТ ИСТОЧНИКА ПО ТЕМПЕРАТУРЕ — приближение чёрного тела (Таннер
 * Хелланд), смягчённое к белому на треть: глаз в комнате адаптируется, и
 * сырой спектр 2700 K на экране выглядел бы оранжевым фонарём. Это цвет
 * предпросмотра, не колориметрия лампы. Возвращает sRGB 0…255.
 */
export function kelvinRgb(kelvin: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const soften = (v: number) => Math.round(Math.max(0, Math.min(255, v)) * (2 / 3) + 255 / 3);
  return [soften(r), soften(g), soften(b)];
}

export function kelvinHex(kelvin: number): string {
  return `#${kelvinRgb(kelvin)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

/* ─────────────────────────  модель трека  ───────────────────────── */

/**
 * ТРЕК ЧЁРНЫЙ 780 ММ · 3 СПОТА — по описанию фотографий владельца.
 *
 * Подтверждено подписями фото: длина 780, высота конструкции 120–180,
 * корпус спота около 85 мм и около Ø56, три головки, чёрный матовый
 * металл. Остальное — условные размеры реконструкции, названные числом.
 */
export const TRACK_MODEL = {
  key: TRACK_MODEL_KEY,
  title: 'Трек чёрный 780 мм · 3 спота',
  status: 'VISUAL_RECONSTRUCTION' as const,
  lengthMm: 780,
  heads: TRACK_HEADS,
  /** Визуальная конфигурация: 4 и больше головок — не исходный товар по фото. */
  maxHeads: TRACK_MAX_HEADS,
  headDiameterMm: 56,
  headLengthMm: 85,
  overallHeightMm: [120, 180] as const,
  /* ── условно, только для картинки ── */
  railWidthMm: 22,
  railHeightMm: 18,
  adapterMm: [24, 26, 40] as const,
  stemMm: 40,
  stemDiameterMm: 8,
  reflectorDepthMm: 18,
  beamDeg: TRACK_BEAM_DEG,
  /** Крайние головки — в 130 мм от торцов: шаг 260 мм у трёх. Условно. */
  headSpanMm: 520,
  known: ['длина 780 мм', 'три головки', 'корпус спота около Ø56 × 85 мм', 'высота конструкции 120–180 мм', 'чёрный матовый металл'],
  assumed: [
    'сечение шинопровода 22 × 18 мм — условно',
    'адаптер 24 × 26 × 40 мм и стойка 40 мм — условно',
    'шарнир у тыльного торца корпуса — условно',
    'угол луча 36° — условно',
    'шаг головок 260 мм — условно',
    'артикул, мощность и световой поток не известны',
  ],
};



/** Высота от потолка до шарнира головки, мм — та же у сцены и проверки. */
export const TRACK_PIVOT_DROP_MM = TRACK_MODEL.railHeightMm + TRACK_MODEL.adapterMm[1] + TRACK_MODEL.stemMm;

/** Где головки по треку, мм от центра: три — 260 мм шагом, больше — ровно на тех же 520 мм. */
export function trackHeadOffsetsMm(count: number): number[] {
  const n = Math.max(1, Math.round(count));
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => Math.round(-TRACK_MODEL.headSpanMm / 2 + (TRACK_MODEL.headSpanMm * i) / (n - 1)));
}

/** Название по числу головок: не три — визуальная конфигурация, а не товар с фото. */
export function trackTitle(count: number): string {
  if (count === TRACK_MODEL.heads) return TRACK_MODEL.title;
  return `Трек чёрный · ${count} спотов — визуальная конфигурация (на фото товар 780 мм с тремя головками)`;
}

/* ─────────────────────────  изделия и предпросмотр  ───────────────────────── */

export const AMBIENT_TITLE: Record<LightingAmbient, string> = { day: 'День', evening: 'Вечер', night: 'Ночь' };

/** К какой группе сценария относится источник: споты, фартук, мебель. */
export type LightGroup = 'tracks' | 'apron' | 'furniture';

export function groupOfKey(key: string): LightGroup {
  if (key === UNDER_CABINET_KEY) return 'apron';
  if (key.startsWith('display:') || key.startsWith('module-led:')) return 'furniture';
  return 'tracks';
}

/** Включён ли источник: выбор человека сильнее сцены; днём по умолчанию выключено. */
export function sourceOn(lighting: RoomLighting, key: string): boolean {
  const own = lighting.preview.on[key];
  if (own !== undefined) return own;
  return lighting.preview.ambient !== 'day';
}

/**
 * Головка светит, когда включён трек и саму её не выключали. Умолчание сцены
 * («днём выключено») — у ТРЕКА: у головки своего умолчания нет, она следует
 * за треком. С умолчанием сцены у каждой головки «Трек: вкл» днём не зажигал
 * ни одной (поймано браузером: светлота пятна 101.8 → 101.8).
 */
export function headOn(lighting: RoomLighting, fixture: TrackFixture, index: number): boolean {
  return sourceOn(lighting, trackKey(fixture)) && lighting.preview.on[headKey(fixture, index)] !== false;
}

/* ─────────────────────────  сценарии A–D и свой  ───────────────────────── */

export type LightingSceneKey = 'A' | 'B' | 'C' | 'D';

export const LIGHTING_SCENES: Record<LightingSceneKey, { title: string; ambient: LightingAmbient; off: LightGroup[] }> = {
  A: { title: 'A · День: светильники выключены', ambient: 'day', off: [] },
  B: { title: 'B · Вечер: всё включено', ambient: 'evening', off: [] },
  C: { title: 'C · Ночь: всё включено', ambient: 'night', off: [] },
  D: { title: 'D · Ночь: только фартук и витрины', ambient: 'night', off: ['tracks'] },
};

/** Ключи всех ВКЛЮЧАЕМЫХ источников: треки, лента фартука, ленты модулей и витрин. */
export function sourceKeys(lighting: RoomLighting, displayModuleIds: string[]): string[] {
  const keys: string[] = [];
  for (const fixture of lighting.fixtures) {
    if (fixture.kind === 'track') keys.push(trackKey(fixture));
    else if (fixture.kind === 'under_cabinet') keys.push(UNDER_CABINET_KEY);
    else keys.push(moduleLedKey(fixture.moduleId));
  }
  for (const id of displayModuleIds) keys.push(displayKey(id));
  return keys;
}

/**
 * СЦЕНАРИЙ — ЭТО ОКРУЖЕНИЕ И ВКЛЮЧЁННОЕ, А НЕ ИЗДЕЛИЯ (раздел 8). Светильников
 * сценарий не создаёт: включать нечего — значит нечего. Выбор человека поверх
 * сценария сбрасывается; «свой» — всё, что человек переключил после.
 */
export function applyScene(lighting: RoomLighting, scene: LightingSceneKey): RoomLighting {
  const spec = LIGHTING_SCENES[scene];
  const on: Record<string, boolean> = {};
  if (spec.off.includes('tracks')) {
    for (const fixture of lighting.fixtures) if (fixture.kind === 'track') on[trackKey(fixture)] = false;
  }
  return { ...lighting, preview: { ...lighting.preview, ambient: spec.ambient, on } };
}

/** Какой сценарий сейчас на экране; переключили сверх него — «свой». */
export function sceneOf(lighting: RoomLighting): LightingSceneKey | 'custom' {
  const entries = Object.entries(lighting.preview.on);
  if (entries.length === 0) {
    return lighting.preview.ambient === 'day' ? 'A' : lighting.preview.ambient === 'evening' ? 'B' : 'C';
  }
  const tracks = lighting.fixtures.filter((f): f is TrackFixture => f.kind === 'track').map(trackKey);
  if (
    lighting.preview.ambient === 'night' &&
    tracks.length > 0 &&
    entries.length === tracks.length &&
    entries.every(([key, value]) => value === false && tracks.includes(key))
  ) {
    return 'D';
  }
  return 'custom';
}

/* ─────────────────────────  правки — чистыми функциями  ───────────────────────── */

/** Заменить изделие по id (или добавить в конец). */
export function withFixture(lighting: RoomLighting, fixture: LightFixture): RoomLighting {
  const at = lighting.fixtures.findIndex((f) => f.id === fixture.id);
  const fixtures = at >= 0 ? lighting.fixtures.map((f, i) => (i === at ? fixture : f)) : [...lighting.fixtures, fixture];
  return { ...lighting, fixtures };
}

/** Снять изделие: и его выбор «вкл/выкл» тоже — иначе ключ без изделия висел бы в сцене. */
export function withoutFixture(lighting: RoomLighting, id: string): RoomLighting {
  const on = Object.fromEntries(Object.entries(lighting.preview.on).filter(([key]) => key !== id && !key.startsWith(`${id}#`)));
  return { ...lighting, fixtures: lighting.fixtures.filter((f) => f.id !== id), preview: { ...lighting.preview, on } };
}

export function withOn(lighting: RoomLighting, key: string, on: boolean): RoomLighting {
  return { ...lighting, preview: { ...lighting.preview, on: { ...lighting.preview.on, [key]: on } } };
}

export function withPreview(lighting: RoomLighting, patch: Partial<Omit<LightingPreview, 'on'>>): RoomLighting {
  return { ...lighting, preview: { ...lighting.preview, ...patch } };
}

/** Свободный id трека: `track-1`, `track-2`… — без случайности, порядок добавления. */
export function nextTrackId(lighting: RoomLighting): string {
  let n = 1;
  const taken = new Set(lighting.fixtures.map((f) => f.id));
  while (taken.has(`track-${n}`)) n += 1;
  return `track-${n}`;
}

/* ─────────────────────────  трек в комнате  ───────────────────────── */

export type Vec3 = [number, number, number];

export type HeadPose = {
  /** Ось шарнира головки (тыльный торец корпуса), мир, мм. */
  pivotMm: Vec3;
  /** Луч: единичный вектор из корпуса наружу. */
  dir: Vec3;
  /** Центр корпуса, мир, мм. */
  bodyMm: Vec3;
  /** Центр лицевого торца — откуда свет, мир, мм. */
  lensMm: Vec3;
  /** Поворот стойки вокруг вертикали в мире, радианы (`rotation.y` группы стойки). */
  yawRad: number;
  /** Наклон корпуса от вертикали, радианы. */
  tiltRad: number;
};

export type TrackPose = {
  wall: RoomWall;
  /** Центр шинопровода на потолке, мир, мм. */
  centerMm: Vec3;
  /** Вдоль шинопровода (единичный, в плане). */
  xAxis: Vec3;
  /** Поперёк шинопровода — к стене привязки при повороте 0. */
  zAxis: Vec3;
  /** Поворот шинопровода вокруг вертикали в мире, радианы. */
  yawRad: number;
  heads: HeadPose[];
};

const rotate2 = (v: [number, number], rad: number): [number, number] => [
  v[0] * Math.cos(rad) - v[1] * Math.sin(rad),
  v[0] * Math.sin(rad) + v[1] * Math.cos(rad),
];

/**
 * ГДЕ ТРЕК И КУДА СВЕТИТ КАЖДАЯ ГОЛОВКА — одна функция на сетку, свет и
 * проверку. Шинопровод лежит на потолке (высота — из замера), центр — у
 * стены привязки; поворот вокруг вертикали. Головка: стойка поворачивается
 * вокруг вертикали (`panDeg`, 0 — к стене привязки), корпус наклоняется на
 * шарнире у тыльного торца (`tiltDeg` от вертикали). Нет стены привязки в
 * комнате — `null`: трек без стены не ставится наугад.
 *
 * Сцене: группа стойки — в шарнире, `rotation.y = yawRad` (её +Z смотрит
 * туда, куда наклоняется корпус), внутри неё группа корпуса —
 * `rotation.x = −tiltRad`; корпус и источник света — её дети по оси −Y.
 * Ry(yaw)·Rx(−tilt)·(0, −1, 0) = `dir` — тот же луч, что здесь.
 */
export function trackPose(fixture: TrackFixture, room: Pick<Room, 'walls' | 'ceilingMm'>): TrackPose | null {
  const wall = room.walls.find((candidate) => candidate.id === fixture.wallId);
  if (!wall) return null;
  const along = Math.max(0, Math.min(wall.lengthMm, fixture.alongMm));
  const cx = wall.startMm[0] + wall.dir[0] * along + wall.inward[0] * fixture.outMm;
  const cz = wall.startMm[1] + wall.dir[1] * along + wall.inward[1] * fixture.outMm;
  const rot = fixture.rotationDeg * DEG;
  const [ax, az] = rotate2(wall.dir, rot);
  /* Поперёк — к стене привязки: минус нормаль в комнату, повёрнутая вместе с шинопроводом. */
  const [bx, bz] = rotate2([-wall.inward[0], -wall.inward[1]], rot);
  const ceiling = room.ceilingMm;
  const yawRad = Math.atan2(-az, ax);
  const offsets = trackHeadOffsetsMm(fixture.heads.length);
  const heads = fixture.heads.map((head, i): HeadPose => {
    const offset = offsets[i] ?? 0;
    const pivot: Vec3 = [cx + ax * offset, ceiling - TRACK_PIVOT_DROP_MM, cz + az * offset];
    const pan = head.panDeg * DEG;
    const tilt = Math.max(0, Math.min(90, head.tiltDeg)) * DEG;
    /* Направление наклона в плане: «к стене» (поперёк), повёрнутое стойкой. */
    const [hx, hz] = rotate2([bx, bz], pan);
    const dir: Vec3 = [Math.sin(tilt) * hx, -Math.cos(tilt), Math.sin(tilt) * hz];
    const at = (mm: number): Vec3 => [pivot[0] + dir[0] * mm, pivot[1] + dir[1] * mm, pivot[2] + dir[2] * mm];
    return {
      pivotMm: pivot,
      dir,
      bodyMm: at(TRACK_MODEL.headLengthMm / 2),
      lensMm: at(TRACK_MODEL.headLengthMm),
      yawRad: Math.atan2(hx, hz),
      tiltRad: tilt,
    };
  });
  return {
    wall,
    centerMm: [cx, ceiling, cz],
    xAxis: [ax, 0, az],
    zAxis: [bx, 0, bz],
    yawRad,
    heads,
  };
}

/** Где луч головки пересекает горизонталь на высоте `yMm` (столешница, пол). Вверх не светит — `null`. */
export function beamHit(pose: Pick<HeadPose, 'lensMm' | 'dir'>, yMm: number): Vec3 | null {
  if (pose.dir[1] >= -1e-6) return null;
  const t = (yMm - pose.lensMm[1]) / pose.dir[1];
  if (t < 0) return null;
  return [pose.lensMm[0] + pose.dir[0] * t, yMm, pose.lensMm[2] + pose.dir[2] * t];
}

/**
 * НОВЫЙ ТРЕК — над передним краем столешницы ряда: по центру ряда на его
 * стене, в 150 мм перед фасадами. Головки наклонены к стене ровно настолько,
 * чтобы ось луча легла на переднюю часть столешницы (0,8 глубины ряда от
 * стены): наклон считается из высоты потолка и рабочей поверхности, а не
 * подбирается. Всё правится панелью.
 */
export function newTrack(
  id: string,
  wall: Pick<RoomWall, 'id' | 'rowStartMm' | 'heightMm'>,
  run: Pick<Run, 'lengthMm'>,
  rowDepthMm: number,
  /** Верх столешницы от пола, мм (`workTopMm` школы цеха ряда). */
  workTopMm: number,
): TrackFixture {
  const outMm = Math.round(rowDepthMm + 150);
  const drop = Math.max(1, wall.heightMm - TRACK_PIVOT_DROP_MM - TRACK_MODEL.headLengthMm - workTopMm);
  const tiltDeg = Math.max(0, Math.min(90, Math.round((Math.atan2(outMm - rowDepthMm * 0.8, drop) * 180) / Math.PI)));
  return {
    id,
    kind: 'track',
    model: TRACK_MODEL.key,
    wallId: wall.id,
    alongMm: Math.round(wall.rowStartMm + run.lengthMm / 2),
    outMm,
    rotationDeg: 0,
    heads: Array.from({ length: TRACK_MODEL.heads }, () => ({ panDeg: 0, tiltDeg })),
    brightness: 80,
    kelvin: DEFAULT_KELVIN,
    beamDeg: TRACK_MODEL.beamDeg,
  };
}

/**
 * ТРЕК НЕ ВНУТРИ МЕБЕЛИ (раздел 6: «нельзя закреплять потолочный трек внутри
 * шкафа»). Габарит шинопровода и головок против габаритов модулей рядов в
 * мире — тех же мест, что у сцены (`runPlaces` + `rowPlacement`). Возвращает
 * слова отказа или `null`.
 */
export function trackClash(
  fixture: TrackFixture,
  room: Pick<Room, 'walls' | 'ceilingMm'>,
  rows: { run: Run; placement?: { xM: number; zM: number; rotationYDeg: number } }[],
): string | null {
  const pose = trackPose(fixture, room);
  if (!pose) return 'Стены привязки трека в комнате нет.';
  const half = TRACK_MODEL.lengthMm / 2;
  const r = TRACK_MODEL.headDiameterMm / 2;
  const points: Vec3[] = [];
  for (const s of [-half, half]) {
    for (const w of [-TRACK_MODEL.railWidthMm / 2, TRACK_MODEL.railWidthMm / 2]) {
      points.push([
        pose.centerMm[0] + pose.xAxis[0] * s + pose.zAxis[0] * w,
        pose.centerMm[1] - TRACK_MODEL.railHeightMm,
        pose.centerMm[2] + pose.xAxis[2] * s + pose.zAxis[2] * w,
      ]);
    }
  }
  for (const head of pose.heads) points.push(head.pivotMm, head.bodyMm, head.lensMm);
  const box = {
    min: [Infinity, Infinity, Infinity] as Vec3,
    max: [-Infinity, -Infinity, -Infinity] as Vec3,
  };
  for (const p of points) {
    for (let k = 0; k < 3; k += 1) {
      box.min[k] = Math.min(box.min[k], p[k] - (k === 1 ? 0 : r));
      box.max[k] = Math.max(box.max[k], p[k] + (k === 1 ? 0 : r));
    }
  }
  box.max[1] = pose.centerMm[1];
  for (const row of rows) {
    const place = rowPlacement(row);
    const angle = place.rotationYDeg * DEG;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const at of runPlaces(row.run)) {
      const x0 = at.x;
      const x1 = at.x + at.unit.widthMm / MM;
      const z0 = at.zM - at.depthM;
      const z1 = at.zM;
      const y0 = at.y * MM;
      const y1 = (at.y + at.heightM) * MM;
      const corners = [
        [x0, z0],
        [x1, z0],
        [x0, z1],
        [x1, z1],
      ].map(([x, z]) => [(x * cos + z * sin + place.xM) * MM, (-x * sin + z * cos + place.zM) * MM]);
      const minX = Math.min(...corners.map((c) => c[0]));
      const maxX = Math.max(...corners.map((c) => c[0]));
      const minZ = Math.min(...corners.map((c) => c[1]));
      const maxZ = Math.max(...corners.map((c) => c[1]));
      const dx = Math.min(box.max[0], maxX) - Math.max(box.min[0], minX);
      const dy = Math.min(box.max[1], y1) - Math.max(box.min[1], y0);
      const dz = Math.min(box.max[2], maxZ) - Math.max(box.min[2], minZ);
      if (dx > 1 && dy > 1 && dz > 1) {
        return `Трек заходит в «${at.unit.label}» (${at.unit.widthMm} мм, верх на ${Math.round(y1)} мм): светильник оказался бы внутри шкафа — сдвиньте его от стены или вдоль.`;
      }
    }
  }
  return null;
}

/* ─────────────────────────  лента под верхними шкафами  ───────────────────────── */

/** Участок ленты в координатах ряда, мм: вдоль ряда, низ шкафов от пола, глубина модуля. */
export type UnderCabinetSpan = {
  fromMm: number;
  toMm: number;
  /** Низ верхних шкафов от пола. */
  bottomMm: number;
  /** Передняя плоскость шкафов в осях ряда (фасады нижнего ряда — ноль), мм. */
  frontZMm: number;
  depthMm: number;
  moduleIds: string[];
};

/** Шкаф, под которым идёт лента: висящий модуль над столешницей, без вытяжки, угла и кладовки. */
function bearsUnderLight(unit: Module): boolean {
  if (unit.kind !== 'upper') return false;
  if (unit.appliance) return false;
  if (unit.section === 'mezzanine') return false;
  return true;
}

/**
 * ГДЕ ИДЁТ ЛЕНТА ФАРТУКА — по верхним шкафам ЭТОГО ряда (`runPlaces`, те же
 * места, что у сцены и раскроя). Шкафы подряд на одной высоте — один
 * участок; разрыв (окно, колонна, пустота), вытяжка, угловой Г-модуль и
 * кладовка — конец участка. Сквозь стены лента не идёт: ряд — одна стена.
 */
export function underCabinetSpans(run: Run): UnderCabinetSpan[] {
  const uppers = runPlaces(run)
    .filter((place) => bearsUnderLight(place.unit))
    .map((place) => ({
      id: place.unit.id,
      from: Math.round(place.x * MM),
      to: Math.round(place.x * MM + place.unit.widthMm),
      bottom: Math.round(place.y * MM),
      front: Math.round(place.zM * MM),
      depth: Math.round(place.depthM * MM),
    }))
    .sort((a, b) => a.from - b.from);
  const spans: UnderCabinetSpan[] = [];
  for (const u of uppers) {
    const last = spans[spans.length - 1];
    if (last && Math.abs(u.from - last.toMm) <= 1 && u.bottom === last.bottomMm && u.front === last.frontZMm) {
      last.toMm = u.to;
      last.depthMm = Math.min(last.depthMm, u.depth);
      last.moduleIds.push(u.id);
    } else {
      spans.push({ fromMm: u.from, toMm: u.to, bottomMm: u.bottom, frontZMm: u.front, depthMm: u.depth, moduleIds: [u.id] });
    }
  }
  return spans;
}

/** Отступ ленты от переднего края или от стены, мм — условно: профиля в каталоге нет. */
export const UNDER_CABINET_INSET_MM = 40;
/** Короче этого линия не ставится: отступ съел участок. */
export const LED_MIN_LENGTH_MM = 100;

/** Где лента по глубине в осях ряда, мм: у края — за фасадом, у стены — перед задней стенкой. */
export function underCabinetZMm(span: Pick<UnderCabinetSpan, 'frontZMm' | 'depthMm'>, placement: UnderCabinetFixture['placement']): number {
  return placement === 'front' ? span.frontZMm - UNDER_CABINET_INSET_MM : span.frontZMm - span.depthMm + UNDER_CABINET_INSET_MM;
}

/** Линия ленты на участке: отступ от торцов — это и есть «длина линии». Короче 100 мм — нет линии. */
export function underCabinetLine(span: UnderCabinetSpan, fixture: Pick<UnderCabinetFixture, 'insetMm'>): { fromMm: number; toMm: number; lengthMm: number } | null {
  const fromMm = span.fromMm + fixture.insetMm;
  const toMm = span.toMm - fixture.insetMm;
  if (toMm - fromMm < LED_MIN_LENGTH_MM) return null;
  return { fromMm, toMm, lengthMm: toMm - fromMm };
}

/* ─────────────────────────  лента витрины и модуля  ───────────────────────── */

/** Есть ли у модуля лента витрины — тот же признак, что выписывает её в смету. */
export function hasDisplayLed(unit: Pick<Module, 'section' | 'variant'>): boolean {
  return unit.section === 'glass_display' || variantEstimateKeys(unit as Module).includes('led_display');
}

/** Модуль, в который можно поставить свою ленту: корпус есть, это не прибор и не планка. */
export function moduleTakesLed(unit: Module): boolean {
  if (unit.kind === 'filler') return false;
  if (unit.appliance && !unit.column) return false;
  return !hasDisplayLed(unit);
}

/** Полоса ленты в осях модуля, мм: x от левого края, y от низа корпуса, z от фасада назад (минус). */
export type LedStrip = { key: string; center: Vec3; lengthMm: number; axis: 'x' | 'y'; facing: 'down' | 'left' | 'right' };

/**
 * ЛЕНТЫ В МОДУЛЕ. Контур — две вертикали у боковин и горизонтали под крышей и
 * над дном, у переднего края (так ленту витрины считает смета:
 * `displayLedMeters`, периметр проёма). Под полками — у переднего края каждой
 * полки, светит вниз. Под крышей — одна горизонталь у фасада. Полки — те же
 * `fill.shelves`, что режет цех и рисует сцена.
 */
export function moduleLedStrips(
  unit: Pick<Module, 'widthMm' | 'fill'>,
  heightMm: number,
  carcassMm: number,
  mode: 'contour' | 'shelves' | 'top',
): LedStrip[] {
  const w = unit.widthMm;
  const t = carcassMm;
  const z = -UNDER_CABINET_INSET_MM;
  const innerH = Math.max(0, heightMm - 2 * t);
  const innerW = Math.max(0, w - 2 * t);
  const top: LedStrip = { key: 'top', center: [w / 2, heightMm - t - 6, z], lengthMm: innerW, axis: 'x', facing: 'down' };
  if (mode === 'top') return [top];
  if (mode === 'contour') {
    return [
      { key: 'left', center: [t + 6, heightMm / 2, z], lengthMm: innerH, axis: 'y', facing: 'right' },
      { key: 'right', center: [w - t - 6, heightMm / 2, z], lengthMm: innerH, axis: 'y', facing: 'left' },
      top,
      { key: 'bottom', center: [w / 2, t + 6, z], lengthMm: innerW, axis: 'x', facing: 'down' },
    ];
  }
  const shelves = (unit.fill?.bays ? [] : (unit.fill?.shelves ?? [])).map(
    (mm, i): LedStrip => ({ key: `shelf-${i}`, center: [w / 2, mm - t / 2 - 6, z], lengthMm: innerW, axis: 'x', facing: 'down' }),
  );
  return [top, ...shelves];
}

/* ─────────────────────────  день, вечер, ночь  ───────────────────────── */

/**
 * СЦЕНА — ЭТО ОКРУЖЕНИЕ, А НЕ ИЗДЕЛИЯ. Числа — множители к свету САПР-вида
 * (`cadLook`), солнце — направленный источник из окна, небо — свет окна.
 * «Ночь» — не чёрный фильтр поверх кадра: гаснут окружение, небо и солнце;
 * остаётся техническая подсветка сцены (`technical`), без неё ночная сцена
 * неразличима, — и она названа, чтобы её не путали со светильниками.
 */
export type AmbientRig = {
  /** × яркость окружения САПР-вида. */
  environment: number;
  /** × полусферический свет САПР-вида. */
  hemisphere: number;
  /** × ключевой свет САПР-вида: солнце через окно. */
  sun: number;
  sunKelvin: number;
  /** Высота солнца над горизонтом, градусы. */
  sunElevationDeg: number;
  /** Свет из проёма окна (источник-прямоугольник), относительная яркость. */
  sky: number;
  /** Цвет неба в проёме. */
  skyHex: string;
  background: string;
  /** Экспозиция рендерера. */
  exposure: number;
  /** Доля технической подсветки ночью, % — словами в панели. */
  technicalPct: number;
};

export const AMBIENT_RIG: Record<LightingAmbient, AmbientRig> = {
  day: { environment: 1, hemisphere: 1, sun: 1.3, sunKelvin: 5600, sunElevationDeg: 38, sky: 1, skyHex: '#DCE8F4', background: '#E9E6DF', exposure: 1, technicalPct: 0 },
  evening: { environment: 0.3, hemisphere: 0.25, sun: 0.35, sunKelvin: 3000, sunElevationDeg: 9, sky: 0.22, skyHex: '#B79A8C', background: '#2C2A31', exposure: 1.05, technicalPct: 0 },
  night: { environment: 0.06, hemisphere: 0.05, sun: 0, sunKelvin: 4100, sunElevationDeg: 30, sky: 0, skyHex: '#0C1018', background: '#0B0D12', exposure: 1.1, technicalPct: 6 },
};

/** Проём окна для света: центр на внутренней грани стены, мм; нормаль в комнату. */
export type WindowLight = { id: string; wallId: string; centerMm: Vec3; inward: [number, number]; along: [number, number]; widthMm: number; heightMm: number };

/** Окна комнаты по НАРИСОВАННОЙ комнате (`roomLayout`): только сквозные проёмы вида «окно». */
export function windowLights(room: Pick<Room, 'walls' | 'objects'> | null): WindowLight[] {
  if (!room) return [];
  const out: WindowLight[] = [];
  for (const object of room.objects) {
    if (object.kind !== 'window' || object.cut !== 'through') continue;
    const wall = room.walls.find((w) => w.id === object.wallId);
    if (!wall) continue;
    const along = object.fromMm + object.widthMm / 2;
    out.push({
      id: object.id,
      wallId: wall.id,
      centerMm: [wall.startMm[0] + wall.dir[0] * along, (object.bottomMm + object.topMm) / 2, wall.startMm[1] + wall.dir[1] * along],
      inward: wall.inward,
      along: wall.dir,
      widthMm: object.widthMm,
      heightMm: object.topMm - object.bottomMm,
    });
  }
  return out;
}

export type Daylight =
  | { source: 'windows'; windowId: string; windows: number; travel: Vec3 }
  | { source: 'demo'; words: string };

/**
 * ОТКУДА ДНЕВНОЙ СВЕТ: из самого большого окна замера, сверху под углом
 * солнца и чуть вбок — тени тогда читаются. Окон в замере нет — свет
 * демонстрационный, и это сказано (раздел 7: окна не придумываются).
 */
export function daylightOf(room: Pick<Room, 'walls' | 'objects'> | null, elevationDeg: number): Daylight {
  const windows = windowLights(room);
  if (windows.length === 0) {
    return { source: 'demo', words: 'Окон в замере нет — дневной свет демонстрационный: со стороны камеры, а не из окна.' };
  }
  const main = windows.reduce((a, b) => (b.widthMm * b.heightMm > a.widthMm * a.heightMm ? b : a));
  const e = elevationDeg * DEG;
  const side = 20 * DEG;
  const hx = main.inward[0] * Math.cos(side) + main.along[0] * Math.sin(side);
  const hz = main.inward[1] * Math.cos(side) + main.along[1] * Math.sin(side);
  return { source: 'windows', windowId: main.id, windows: windows.length, travel: [hx * Math.cos(e), -Math.sin(e), hz * Math.cos(e)] };
}

/* ─────────────────────────  план источников сцены  ───────────────────────── */

/**
 * БЮДЖЕТ ИСТОЧНИКОВ (раздел 16): источник-прямоугольник считается в каждом
 * пикселе каждого освещаемого материала, тень спота — это ещё один проход
 * по сцене. Сверх бюджета лента светится сама (свечение диффузора), но
 * своего источника не получает — и это сказано словами в панели.
 */
export const RECT_LIGHT_BUDGET = 16;
export const SPOT_SHADOW_BUDGET = 3;
/** Окна со своим источником света — не больше: остальные светят небом в проёме. */
export const WINDOW_LIGHT_BUDGET = 4;

export const DEFAULT_DISPLAY_LIGHT: DisplayLight = { brightness: 70, kelvin: DEFAULT_KELVIN, mode: 'contour' };

/** Полоса ленты в сцене: в осях РЯДА (x от левого края ряда, y от пола, z от фасадов назад — минус), мм. */
export type PlannedStrip = {
  key: string;
  /** Ключ включения (`sourceOn`). */
  source: string;
  kind: 'under' | 'display' | 'module';
  rowIndex: number;
  moduleId: string | null;
  centerMm: Vec3;
  lengthMm: number;
  axis: 'x' | 'y';
  facing: 'down' | 'left' | 'right';
  brightness: number;
  kelvin: LightKelvin;
  /** Получила ли полоса свой источник света (в пределах бюджета). */
  light: boolean;
};

export type LightingPlan = {
  strips: PlannedStrip[];
  windows: WindowLight[];
  /** У какого окна свой источник света (по порядку `windows`). */
  windowLight: boolean[];
  rectLights: number;
  /** Полос без своего источника: бюджет кончился. */
  overBudget: number;
  /** Ленты модулей, чьих модулей в рядах сцены нет, — словами. */
  orphans: string[];
  /** Витрины со своей лентой в рядах сцены. */
  displays: { moduleId: string; label: string; rowIndex: number }[];
};

/**
 * ПЛАН ИСТОЧНИКОВ — ОДНА ФУНКЦИЯ НА СЦЕНУ И ПРИЁМКУ. Где ленты (под шкафами —
 * `underCabinetSpans`, в модулях — `moduleLedStrips` по тем же `runPlaces`),
 * какие из них получают источник света в пределах бюджета (окна, фартук,
 * витрины, ленты модулей — в этом порядке), чьих модулей в сцене нет.
 */
export function lightingPlan(
  lighting: RoomLighting,
  rows: { run: Run }[],
  room: Pick<Room, 'walls' | 'objects'> | null,
  /** Толщина корпуса — школы цеха экрана, той же, что у коробок сцены. */
  carcassMm: number,
): LightingPlan {
  const strips: PlannedStrip[] = [];
  const displays: LightingPlan['displays'] = [];
  const under = lighting.fixtures.find((f): f is UnderCabinetFixture => f.kind === 'under_cabinet');
  const moduleLeds = lighting.fixtures.filter((f): f is ModuleLedFixture => f.kind === 'module_led');
  const seenModules = new Set<string>();

  rows.forEach((row, rowIndex) => {
    if (under) {
      underCabinetSpans(row.run).forEach((span, i) => {
        const line = underCabinetLine(span, under);
        if (!line) return;
        strips.push({
          key: `under:${row.run.id}:${i}`,
          source: UNDER_CABINET_KEY,
          kind: 'under',
          rowIndex,
          moduleId: null,
          centerMm: [(line.fromMm + line.toMm) / 2, span.bottomMm - 4, underCabinetZMm(span, under.placement)],
          lengthMm: line.lengthMm,
          axis: 'x',
          facing: 'down',
          brightness: under.brightness,
          kelvin: under.kelvin,
          light: false,
        });
      });
    }
    for (const place of runPlaces(row.run)) {
      const unit = place.unit;
      seenModules.add(unit.id);
      const heightMm = Math.round(place.heightM * MM);
      const at = (local: Vec3): Vec3 => [place.x * MM + local[0], place.y * MM + local[1], place.zM * MM + local[2]];
      if (hasDisplayLed(unit)) {
        displays.push({ moduleId: unit.id, label: unit.label, rowIndex });
        const own = lighting.displays[unit.id] ?? DEFAULT_DISPLAY_LIGHT;
        for (const strip of moduleLedStrips(unit, heightMm, carcassMm, own.mode)) {
          strips.push({
            key: `display:${unit.id}:${strip.key}`,
            source: displayKey(unit.id),
            kind: 'display',
            rowIndex,
            moduleId: unit.id,
            centerMm: at(strip.center),
            lengthMm: strip.lengthMm,
            axis: strip.axis,
            facing: strip.facing,
            brightness: own.brightness,
            kelvin: own.kelvin,
            light: false,
          });
        }
      }
      const led = moduleLeds.find((f) => f.moduleId === unit.id);
      if (led && moduleTakesLed(unit)) {
        for (const strip of moduleLedStrips(unit, heightMm, carcassMm, led.mode)) {
          strips.push({
            key: `module:${unit.id}:${strip.key}`,
            source: moduleLedKey(unit.id),
            kind: 'module',
            rowIndex,
            moduleId: unit.id,
            centerMm: at(strip.center),
            lengthMm: strip.lengthMm,
            axis: strip.axis,
            facing: strip.facing,
            brightness: led.brightness,
            kelvin: led.kelvin,
            light: false,
          });
        }
      }
    }
  });

  const windows = windowLights(room);
  let budget = RECT_LIGHT_BUDGET;
  const windowLight = windows.map((_, i) => {
    if (i >= WINDOW_LIGHT_BUDGET || budget <= 0) return false;
    budget -= 1;
    return true;
  });
  /* Порядок раздачи: фартук, витрины (кроме нижней полосы контура), ленты модулей. */
  const order: PlannedStrip['kind'][] = ['under', 'display', 'module'];
  for (const kind of order) {
    for (const strip of strips) {
      if (strip.kind !== kind || budget <= 0) continue;
      if (strip.key.endsWith(':bottom')) continue;
      strip.light = true;
      budget -= 1;
    }
  }
  const orphans = moduleLeds
    .filter((f) => !seenModules.has(f.moduleId))
    .map((f) => `Подсветка модуля ${f.moduleId}: модуля в этой сцене нет — лента не показывается.`);
  return {
    strips,
    windows,
    windowLight,
    rectLights: RECT_LIGHT_BUDGET - budget,
    overBudget: strips.filter((s) => !s.light && !s.key.endsWith(':bottom')).length,
    orphans,
    displays,
  };
}
