import type { HardwareItem, HardwareModel3dStatus } from '@/types/catalog';
import type { HandleSpot, LeafGeometry } from './handlePlace';

/**
 * РУЧКА ЧИСЛАМИ (HANDLE-REAL) — без three.
 *
 * Модель ручки ВЫВОДИТСЯ из позиции каталога, а не хранится рядом с ней:
 * форма — из подвида (`bar_handle`, `knob`, `flush_handle`, `edge_handle`),
 * размеры — из канонических размеров записи изделия (`dimensionsMm`:
 * `length`, `holeSpacing`, `projection`, `diameter`, `flangeDiameter`…),
 * покрытие — из подписи исполнения. Те же поля есть и в лёгкой записи
 * Studio, поэтому модель одна и до, и после дочитывания паспорта.
 *
 * CAD производителя здесь нет: права на него не подтверждены ни у кого
 * (Blum — за входом, Hettich — согласие с условиями, Häfele недоступен,
 * BOYARD — NOT_VERIFIED). Сетка строится своя:
 *
 *   скоба    — пруток Ø d, согнутый буквой П: стойки на межосевом C,
 *              вылет B, длина A = C + d (как на чертеже Häfele 115.52);
 *   кнопка   — тело вращения Ø D × B; резиновые кольца, где они названы;
 *   врезная  — фланец Ø A толщиной по чертежу и тёмное дно Ø B: углубление
 *              в фасаде НЕ вырезается — показано светом и названо;
 *   торцевая — профиль на кромке: стенка по тылу фасада, полка над кромкой
 *              (глубина в плане B, у волнистой — переменная), губа по лицу;
 *   профиль  — условный уголок на кромке во всю ширину фасада (тип ручки
 *              «Профиль» без артикула).
 *
 * ПО ЭТОЙ ГЕОМЕТРИИ НИЧЕГО НЕ СВЕРЛЯТ И НЕ ЗАКАЗЫВАЮТ. Присадка ручки — у
 * `moduleDrilling` по подтверждённым числам; цена и количество — у сметы.
 * Здесь только то, как ручка выглядит, — и статус, насколько это точно.
 */

const MM = 1000;

/* ─────────────────────────  покрытие  ───────────────────────── */

export type HandleFinish =
  | 'stainless_brushed'
  | 'stainless_look'
  | 'aluminium'
  | 'silver_anodized'
  | 'chrome'
  | 'matte_chrome'
  | 'black_matte'
  | 'white_matte'
  | 'bronze_pvd'
  | 'bronze_antique'
  | 'brass'
  | 'gold'
  | 'demo';

export const HANDLE_FINISH_TITLE: Record<HandleFinish, string> = {
  stainless_brushed: 'нержавеющая сталь, шлифованная',
  stainless_look: 'алюминий цвета нержавеющей стали',
  aluminium: 'алюминий',
  silver_anodized: 'алюминий серебристый, анодированный',
  chrome: 'хром',
  matte_chrome: 'матовый хром',
  black_matte: 'чёрный матовый',
  white_matte: 'белый',
  bronze_pvd: 'под бронзу, PVD',
  bronze_antique: 'бронза античная',
  brass: 'латунь',
  gold: 'золото',
  demo: 'покрытие не названо — показано условно',
};

/**
 * ПОКРЫТИЕ ПО ПОДПИСИ ИСПОЛНЕНИЯ.
 *
 * Читаются `finish`, официальное название и вариант — поля, которые есть и
 * в лёгкой записи: одна позиция не меняет цвет, когда дочитывается паспорт.
 * Слова про резиновые кольца кнопки снимаются до разбора: «Резиновые кольца:
 * черный» — это кольца, а не покрытие ручки. Не узнано — `demo`, и это
 * сказано: произвольный цвет артикулу не назначается.
 */
export function handleFinishOf(hardware: Pick<HardwareItem['hardware'], 'finish' | 'officialName' | 'variant'>): HandleFinish {
  const text = [hardware.finish, hardware.officialName, hardware.variant]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/резинов\S*\s+кольц\S*[:\s]*(?:черн\S*|бел\S*)?/g, ' ');
  if (/черн|black|ral\s*9005/.test(text)) return 'black_matte';
  if (/бел[ыао]|white|ral\s*9010/.test(text)) return 'white_matte';
  if (/античн/.test(text)) return 'bronze_antique';
  if (/бронз/.test(text)) return 'bronze_pvd';
  if (/латун|brass/.test(text)) return 'brass';
  if (/золот|gold/.test(text)) return 'gold';
  if (/хром|chrome/.test(text)) return /матов\S*\s+хром|хром\S*\s+матов/.test(text) ? 'matte_chrome' : 'chrome';
  if (/цвета\s+нерж/.test(text)) return 'stainless_look';
  if (/серебрист|анодир/.test(text)) return 'silver_anodized';
  if (/нержаве|stainless|шлифован/.test(text)) return 'stainless_brushed';
  if (/алюмин/.test(text)) return 'aluminium';
  return 'demo';
}

/* ─────────────────────────  модель  ───────────────────────── */

export type HandleShape = 'bar' | 'knob' | 'flush' | 'edge' | 'strip';

/** Профиль на кромке: всё в мм; `depthMm` — от тыла фасада вперёд в плане. */
export type HandleEdgeProfile = {
  /** Глубина в плане посередине длины. `null` — тыл фасада + вылет губы (у малых ручек вылет напечатан, глубина — нет). */
  depthMm: number | null;
  /** Глубина у краёв: у волнистой меньше, чем посередине. */
  depthEndMm: number | null;
  /** Вылет губы от лица фасада — когда напечатан он, а не глубина. */
  reachMm: number | null;
  /** Стенка по тылу фасада вниз от кромки. */
  backMm: number;
  /** Губа по лицу фасада вниз от полки. */
  lipMm: number;
  sheetMm: number;
};

export type HandleModel = {
  shape: HandleShape;
  /** Вдоль ручки: скоба — A, торцевая и профиль — длина, кнопка и врезная — диаметр. */
  lengthMm: number;
  /** Межосевое крепления — подпись, не присадка. */
  centersMm: number | null;
  /** Вылет от лица фасада: скоба и кнопка — B, врезная — толщина фланца. */
  projectionMm: number;
  /** Пруток скобы, Ø кнопки, Ø фланца врезной. */
  diameterMm: number;
  /** Врезная: корпус (отверстие в фасаде) и его глубина. */
  bodyDiameterMm?: number;
  bodyDepthMm?: number;
  /** Кнопка: резиновые кольца — по подписи исполнения. */
  rings?: number;
  edge?: HandleEdgeProfile;
  finish: HandleFinish;
  status: HardwareModel3dStatus;
  /** Что взято с чертежа, а что нарисовано условно — словами, для карточки и отчёта. */
  notes: string[];
  /** Ключ сетки: одинаковые ручки — одна сетка на все фасады. Покрытие в него не входит. */
  key: string;
};

export type HandleModelResult = { model: HandleModel | null; status: HardwareModel3dStatus; words: string };

const num = (dims: Record<string, number> | undefined, key: string): number | null => {
  const v = dims?.[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
};

function keyOf(model: Omit<HandleModel, 'key' | 'finish' | 'status' | 'notes'>): string {
  const e = model.edge;
  return [
    model.shape,
    model.lengthMm,
    model.centersMm ?? '',
    model.projectionMm,
    model.diameterMm,
    model.bodyDiameterMm ?? '',
    model.bodyDepthMm ?? '',
    model.rings ?? '',
    e ? [e.depthMm ?? '', e.depthEndMm ?? '', e.reachMm ?? '', e.backMm, e.lipMm, e.sheetMm].join(':') : '',
  ].join('|');
}

function finished(
  base: Omit<HandleModel, 'key' | 'finish' | 'status' | 'notes'>,
  finish: HandleFinish,
  status: HardwareModel3dStatus,
  notes: string[],
): HandleModel {
  return { ...base, finish, status, notes, key: keyOf(base) };
}

/** Чего не напечатано — словами: «вылет B не напечатан — 35 мм условно». */
const assumed = (what: string, value: number) => `${what} не напечатан — ${value} мм условно`;

/**
 * МОДЕЛЬ РУЧКИ ПО ПОЗИЦИИ КАТАЛОГА.
 *
 * MEASURED_RECONSTRUCTION — все размеры формы напечатаны (скоба: A, B, C, Ø;
 * кнопка: Ø, B); мелочи без размера (радиус гиба, проточки) — условно и
 * названы. VISUAL_RECONSTRUCTION — форма с чертежа, но часть размеров не
 * сведена или форма показана не целиком (углубление врезной в фасаде,
 * сечение торцевой). NO_3D — модели нет, и сказано почему.
 */
export function handleItemModel(item: Pick<HardwareItem, 'hardware'>): HandleModelResult {
  const h = item.hardware;
  if (h.category !== 'handle') return { model: null, status: 'NO_3D', words: 'не ручка' };
  const dims = h.dimensionsMm;
  const finish = handleFinishOf(h);
  const finishNote = finish === 'demo' ? ['покрытие в подписи исполнения не названо — показано условным металлом'] : [];
  const sub = h.subcategory ?? '';

  if (sub === 'bar_handle') {
    const length = num(dims, 'length');
    if (length === null) {
      return {
        model: null,
        status: 'NO_3D',
        words: 'длина ручки не задана (изготавливается под заказ) — модели нет',
      };
    }
    const diameterPrinted = num(dims, 'diameter');
    const projectionPrinted = num(dims, 'projection');
    const centersPrinted = num(dims, 'holeSpacing');
    const diameter = diameterPrinted ?? 12;
    const projection = Math.max(projectionPrinted ?? 35, diameter + 4);
    const centers = centersPrinted ?? Math.max(diameter, length - diameter);
    const notes = [
      ...(diameterPrinted === null ? [assumed('диаметр прутка', diameter)] : []),
      ...(projectionPrinted === null ? [assumed('вылет B', projection)] : []),
      ...(centersPrinted === null ? [assumed('межосевое C', centers)] : []),
      'радиус гиба на чертеже не образмерен — показан условно',
      ...finishNote,
    ];
    const measured = diameterPrinted !== null && projectionPrinted !== null && centersPrinted !== null && h.engineeringStatus !== 'CONFLICT';
    const status: HardwareModel3dStatus = measured ? 'MEASURED_RECONSTRUCTION' : 'VISUAL_RECONSTRUCTION';
    const model = finished(
      { shape: 'bar', lengthMm: length, centersMm: centers, projectionMm: projection, diameterMm: diameter },
      finish,
      status,
      notes,
    );
    return { model, status, words: `скоба A ${length} · B ${projection} · C ${centers} · Ø${diameter}` };
  }

  if (sub === 'knob') {
    const diameterPrinted = num(dims, 'diameter');
    const projectionPrinted = num(dims, 'projection');
    const diameter = diameterPrinted ?? 25;
    const projection = projectionPrinted ?? 28;
    const text = `${h.finish ?? ''} ${h.variant ?? ''}`.toLowerCase();
    const rings = /резинов\S*\s+кольц/.test(text) ? 2 : 0;
    const notes = [
      ...(diameterPrinted === null ? [assumed('диаметр', diameter)] : []),
      ...(projectionPrinted === null ? [assumed('вылет B', projection)] : []),
      rings > 0 ? 'резиновые кольца названы в исполнении — место колец не образмерено' : 'проточки на фото не образмерены — не рисуются',
      ...finishNote,
    ];
    const measured = diameterPrinted !== null && projectionPrinted !== null;
    const status: HardwareModel3dStatus = measured ? 'MEASURED_RECONSTRUCTION' : 'VISUAL_RECONSTRUCTION';
    const model = finished(
      { shape: 'knob', lengthMm: diameter, centersMm: null, projectionMm: projection, diameterMm: diameter, ...(rings ? { rings } : {}) },
      finish,
      status,
      notes,
    );
    return { model, status, words: `кнопка Ø${diameter} · вылет ${projection}` };
  }

  if (sub === 'flush_handle') {
    const flange = num(dims, 'flangeDiameter');
    const body = num(dims, 'bodyDiameter');
    if (flange === null || body === null || body >= flange) {
      return { model: null, status: 'NO_3D', words: 'диаметры фланца и корпуса не сведены — модели нет' };
    }
    const depth = num(dims, 'bodyDepth');
    const thickPrinted = num(dims, 'flangeThickness');
    const thick = thickPrinted ?? 2;
    const notes = [
      'углубление корпуса в фасаде не вырезается: дно показано тёмным, глубина — словами',
      ...(thickPrinted === null ? [assumed('толщина фланца', thick)] : []),
      ...finishNote,
    ];
    const status: HardwareModel3dStatus = 'VISUAL_RECONSTRUCTION';
    const model = finished(
      {
        shape: 'flush',
        lengthMm: flange,
        centersMm: null,
        projectionMm: thick,
        diameterMm: flange,
        bodyDiameterMm: body,
        ...(depth !== null ? { bodyDepthMm: depth } : {}),
      },
      finish,
      status,
      notes,
    );
    return { model, status, words: `врезная Ø${flange} · корпус Ø${body}${depth !== null ? ` · глубина ${depth}` : ''}` };
  }

  if (sub === 'edge_handle') {
    const length = num(dims, 'length');
    if (length === null) return { model: null, status: 'NO_3D', words: 'длина ручки для кромок не сведена — модели нет' };
    const depth = num(dims, 'edgeDepth');
    const depthEnd = num(dims, 'edgeDepthEnd');
    const reach = num(dims, 'edgeReach');
    const backPrinted = num(dims, 'backLeg');
    const lipPrinted = num(dims, 'lipHeight');
    const sheetPrinted = num(dims, 'sheetThickness');
    const back = backPrinted ?? 16;
    const lip = lipPrinted ?? 3;
    const sheet = sheetPrinted ?? 1.5;
    const notes = [
      'сечение — по чертежу производителя; закругления без размера показаны прямыми',
      ...(depth === null && reach === null ? ['глубина в плане не напечатана — 36 мм условно'] : []),
      ...(backPrinted === null ? [assumed('стенка по тылу фасада', back)] : []),
      ...(lipPrinted === null ? [assumed('губа по лицу', lip)] : []),
      ...(sheetPrinted === null ? [assumed('толщина листа', sheet)] : []),
      ...finishNote,
    ];
    const edge: HandleEdgeProfile = {
      depthMm: depth ?? (reach === null ? 36 : null),
      depthEndMm: depthEnd,
      reachMm: depth === null ? reach : null,
      backMm: back,
      lipMm: lip,
      sheetMm: sheet,
    };
    const status: HardwareModel3dStatus = 'VISUAL_RECONSTRUCTION';
    const model = finished(
      { shape: 'edge', lengthMm: length, centersMm: num(dims, 'holeSpacing'), projectionMm: lip, diameterMm: sheet, edge },
      finish,
      status,
      notes,
    );
    return { model, status, words: `ручка для кромок ${length} мм${depthEnd !== null ? ', волнистая' : ''}` };
  }

  if (sub === 'profile_handle') {
    return {
      model: null,
      status: 'NO_3D',
      words:
        'профиль системы без ручек: крепится к корпусу между столешницей и укороченным фасадом — такой конструкции в правилах цеха нет, на фасад модуля он не ставится',
    };
  }
  if (sub === 'profile_accessory' || sub === 'profile_end_cap') {
    return { model: null, status: 'NO_3D', words: 'принадлежность профиля — отдельной модели у неё нет' };
  }
  return { model: null, status: 'NO_3D', words: sub ? `вид ручки «${sub}» не распознан — модели нет` : 'вид ручки не указан — модели нет' };
}

/** На сколько резиновые кольца кнопки стоят над телом, мм: иначе они спорят с ним в каждом пикселе. */
export const RING_PROUD_MM = 0.02;

/* ── Условные ручки без артикула (VISUAL_APPROXIMATION) ── */

/** Пруток условной скобы, мм: габарит тот же, что у прежнего бруска (16 мм вылета). */
export const GENERIC_BAR_DIAMETER_MM = 8;
export const GENERIC_BAR_PROJECTION_MM = 16;

/**
 * УСЛОВНАЯ СКОБА — тип ручки «Скоба» без артикула. Длина — по правилу места
 * на полотне (`handleBoxOf`: доля стороны), вылет — 16 мм, как у прежнего
 * бруска: проверки открывания у угла меряют тот же габарит.
 */
export function genericBarModel(lengthMm: number): HandleModel {
  const length = Math.round(lengthMm * 10) / 10;
  return finished(
    {
      shape: 'bar',
      lengthMm: length,
      centersMm: Math.max(GENERIC_BAR_DIAMETER_MM, length - GENERIC_BAR_DIAMETER_MM),
      projectionMm: GENERIC_BAR_PROJECTION_MM,
      diameterMm: GENERIC_BAR_DIAMETER_MM,
    },
    'demo',
    'VISUAL_APPROXIMATION',
    ['артикул ручки не выбран — условная скоба по правилу места на фасаде'],
  );
}

/** УСЛОВНЫЙ ПРОФИЛЬ — тип «Профиль» без артикула: уголок на кромке во всю ширину полотна. */
export function genericStripModel(lengthMm: number): HandleModel {
  const length = Math.round(lengthMm * 10) / 10;
  return finished(
    {
      shape: 'strip',
      lengthMm: length,
      centersMm: null,
      projectionMm: 20,
      diameterMm: 1.6,
      edge: { depthMm: null, depthEndMm: null, reachMm: 12, backMm: 0, lipMm: 20, sheetMm: 1.6 },
    },
    'aluminium',
    'VISUAL_APPROXIMATION',
    ['артикул профиля не выбран — условный уголок по кромке во всю ширину фасада'],
  );
}

/* ─────────────────────────  ориентация и габарит  ───────────────────────── */

/* Поворот, габарит и сечение кромочной ручки читает и сетка (`handleMeshData.ts`): формула одна. */

/**
 * КАК РУЧКА СТОИТ НА ПОЛОТНЕ.
 *
 * Сетка строится в своих осях: x — вдоль ручки, y — поперёк в плоскости
 * фасада, z — от лица фасада наружу; у ручки на кромке y = 0 — кромка.
 *   h      — вдоль горизонтали (как построена);
 *   v      — планка вертикально: поворот на 90° вокруг оси от фасада;
 *   top    — на верхней кромке, губа вниз;
 *   bottom — на нижней кромке, губа вверх: поворот на 180° вокруг оси от фасада.
 */
export type HandleOrient = 'h' | 'v' | 'top' | 'bottom';

export type Vec3 = [number, number, number];

export function orientPoint(p: Vec3, orient: HandleOrient): Vec3 {
  if (orient === 'v') return [-p[1], p[0], p[2]];
  if (orient === 'bottom') return [-p[0], -p[1], p[2]];
  return p;
}

export type HandleBounds = { min: Vec3; max: Vec3 };

export function boundsOfPoints(points: Vec3[]): HandleBounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i += 1) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  }
  return { min, max };
}

/* ── Сечение ручки на кромке ── */

export type Point2 = [number, number];

/** Глубина профиля в плане в точке u ∈ [−L/2, L/2]: у волнистой — плавно к середине. */
function edgeDepthAt(edge: HandleEdgeProfile, frontMm: number, u: number, length: number): number {
  const mid = edge.depthMm ?? frontMm + (edge.reachMm ?? 12);
  const end = edge.depthEndMm ?? mid;
  const bump = (1 + Math.cos((2 * Math.PI * u) / length)) / 2;
  /* Полка обязана перекрыть кромку: глубже тыла фасада хотя бы на лист. */
  return Math.max(frontMm + edge.sheetMm, end + (mid - end) * bump);
}

/**
 * Средняя линия сечения в плоскости (z, y): от низа стенки по тылу фасада
 * вверх, по полке над кромкой вперёд, губой вниз по лицу. z = 0 — лицо
 * фасада, z = −толщина — тыл; y = 0 — кромка.
 */
function edgeCenterline(edge: HandleEdgeProfile, frontMm: number, depth: number): Point2[] {
  const s = edge.sheetMm;
  const back = -frontMm - s / 2;
  const front = -frontMm + depth - s / 2;
  const out: Point2[] = [];
  if (edge.backMm > 0) out.push([back, -edge.backMm]);
  out.push([back, s / 2]);
  out.push([front, s / 2]);
  if (edge.lipMm > 0) out.push([front, s / 2 - edge.lipMm]);
  return out;
}

/** Толстая ломаная → многоугольник сечения против часовой стрелки (митра на изломах). */
function thickPolygon(line: Point2[], thickness: number): { left: Point2[]; right: Point2[] } {
  const half = thickness / 2;
  const normals: Point2[] = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const du = line[i + 1][0] - line[i][0];
    const dv = line[i + 1][1] - line[i][1];
    const len = Math.hypot(du, dv) || 1;
    normals.push([-dv / len, du / len]);
  }
  const left: Point2[] = [];
  const right: Point2[] = [];
  for (let i = 0; i < line.length; i += 1) {
    let n: Point2;
    if (i === 0) n = normals[0];
    else if (i === line.length - 1) n = normals[normals.length - 1];
    else {
      const a = normals[i - 1];
      const b = normals[i];
      const sum: Point2 = [a[0] + b[0], a[1] + b[1]];
      const len = Math.hypot(sum[0], sum[1]) || 1;
      const m: Point2 = [sum[0] / len, sum[1] / len];
      const cos = m[0] * b[0] + m[1] * b[1];
      n = [m[0] / Math.max(cos, 0.2), m[1] / Math.max(cos, 0.2)];
    }
    left.push([line[i][0] + n[0] * half, line[i][1] + n[1] * half]);
    right.push([line[i][0] - n[0] * half, line[i][1] - n[1] * half]);
  }
  return { left, right };
}

/** Точки сечения в одной станции (полностью, для габарита). */
export function edgeSection(model: HandleModel, frontMm: number, u: number): Point2[] {
  const edge = model.edge!;
  const depth = edgeDepthAt(edge, frontMm, u, model.lengthMm);
  const { left, right } = thickPolygon(edgeCenterline(edge, frontMm, depth), edge.sheetMm);
  return [...left, ...right.slice().reverse()];
}

/** Станции вдоль ручки на кромке: у прямой две, у волнистой — по длине. */
export function edgeStations(model: HandleModel): number[] {
  const edge = model.edge!;
  const wavy = edge.depthEndMm !== null && edge.depthMm !== null && Math.abs(edge.depthEndMm - edge.depthMm) > 0.01;
  const count = wavy ? 25 : 2;
  return Array.from({ length: count }, (_, i) => -model.lengthMm / 2 + (model.lengthMm * i) / (count - 1));
}

/**
 * ГАБАРИТ РУЧКИ, мм, в осях ручки после поворота, от точки крепления.
 *
 * Считается без треугольников — его зовут движок на каждой правке и
 * проверка открывания у угла; сетку строит только сцена. Приёмка сверяет,
 * что габарит сетки равен этому до сотой миллиметра.
 */
export function handleBoundsMm(model: HandleModel, orient: HandleOrient, frontMm: number): HandleBounds {
  const corners: Vec3[] = [];
  if (model.shape === 'bar') {
    const r = model.diameterMm / 2;
    const c = model.centersMm ?? model.lengthMm - model.diameterMm;
    corners.push([-c / 2 - r, -r, 0], [c / 2 + r, r, model.projectionMm]);
  } else if (model.shape === 'knob') {
    /* Резиновые кольца стоят на 0.02 мм над телом — чтобы не спорить с ним в каждом пикселе. */
    const r = model.diameterMm / 2 + (model.rings ? RING_PROUD_MM : 0);
    corners.push([-r, -r, 0], [r, r, model.projectionMm]);
  } else if (model.shape === 'flush') {
    const r = model.diameterMm / 2;
    corners.push([-r, -r, 0], [r, r, model.projectionMm]);
  } else {
    for (const u of edgeStations(model)) {
      for (const [z, y] of edgeSection(model, frontMm, u)) corners.push([u, y, z]);
    }
  }
  const box = boundsOfPoints(corners);
  /* Повернутый габарит — по восьми углам. */
  const all: Vec3[] = [];
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) all.push(orientPoint([x, y, z], orient));
  return boundsOfPoints(all);
}

/* ─────────────────────────  посадка на полотно  ───────────────────────── */

/** Ручка на кромке или на лице полотна. */
export function isEdgeShape(shape: HandleShape): boolean {
  return shape === 'edge' || shape === 'strip';
}

/** Насколько ручка отступает от кромки полотна — та же доля, что у прежнего бруска (`handleBoxOf`). */
const EDGE_INSET = 0.12;

export type HandlePlacement = {
  orient: HandleOrient;
  /** Точка крепления в координатах ряда, метры: лицо фасада, место по правилу. */
  mount: Vec3;
  /** Габарит ручки в координатах ряда — то, что меряют проверки и рёбра. */
  position: Vec3;
  scale: Vec3;
  /** Ручка помещается на полотне целиком. Нет — нарисована, а вердикт места говорит словами. */
  fits: boolean;
};

/**
 * ГДЕ РУЧКА СТОИТ НА ЭТОМ ПОЛОТНЕ.
 *
 * На лице (скоба, кнопка, врезная) — по месту ручки (`handleSpotOf`) тем же
 * правилом, что прежний брусок (`handleBoxOf`): отступ — доля меньшей
 * стороны, но не меньше половины ручки. У ящика — по центру фронта.
 * На кромке (торцевая, профиль) — на верхней кромке у нижних рядов и на
 * нижней у навесных; вдоль кромки — у свободного края полотна, у ящика и
 * механизма — посередине.
 */
export function placeHandle(
  model: HandleModel,
  spot: HandleSpot,
  leaf: LeafGeometry,
  options: { seat: 'spot' | 'center'; edge: 'top' | 'bottom' },
): HandlePlacement {
  const { cx, cy, widthM: w, heightM: h, thicknessM: t } = leaf;
  const frontMm = t * MM;
  const inset = Math.min(w, h) * EDGE_INSET;
  let orient: HandleOrient;
  let mx: number;
  let my: number;
  let fits: boolean;
  if (isEdgeShape(model.shape)) {
    orient = options.edge;
    const half = model.lengthMm / MM / 2;
    fits = model.lengthMm / MM <= w + 1e-6;
    const room = Math.max(0, w / 2 - half);
    if (options.seat === 'spot' && (spot.place.startsWith('left') || spot.place.startsWith('right'))) {
      const fromEdge = Math.max(inset, half);
      const want = spot.place.startsWith('left') ? cx - w / 2 + fromEdge : cx + w / 2 - fromEdge;
      mx = Math.min(cx + room, Math.max(cx - room, want));
    } else mx = cx;
    my = orient === 'top' ? cy + h / 2 : cy - h / 2;
  } else {
    orient = model.shape === 'bar' && options.seat === 'spot' && spot.turn === 'vertical' ? 'v' : 'h';
    const box = handleBoundsMm(model, orient, frontMm);
    const halfW = (box.max[0] - box.min[0]) / MM / 2;
    const halfH = (box.max[1] - box.min[1]) / MM / 2;
    fits = halfW <= w / 2 + 1e-6 && halfH <= h / 2 + 1e-6;
    if (options.seat === 'center') {
      mx = cx;
      my = cy;
    } else {
      const edgeX = Math.max(inset, halfW);
      const edgeY = Math.max(inset, halfH);
      mx = spot.place.startsWith('left') ? cx - w / 2 + edgeX : spot.place.startsWith('right') ? cx + w / 2 - edgeX : cx;
      my =
        spot.place.endsWith('-top') || spot.place === 'top-center'
          ? cy + h / 2 - edgeY
          : spot.place.endsWith('-bottom') || spot.place === 'bottom-center'
            ? cy - h / 2 + edgeY
            : cy;
    }
  }
  const mount: Vec3 = [mx, my, t];
  const box = handleBoundsMm(model, orient, frontMm);
  const position: Vec3 = [
    mx + (box.min[0] + box.max[0]) / 2 / MM,
    my + (box.min[1] + box.max[1]) / 2 / MM,
    t + (box.min[2] + box.max[2]) / 2 / MM,
  ];
  const scale: Vec3 = [(box.max[0] - box.min[0]) / MM, (box.max[1] - box.min[1]) / MM, (box.max[2] - box.min[2]) / MM];
  return { orient, mount, position, scale, fits };
}
