import type { ApplianceModel } from './appliances';

/**
 * ТЕХНИКА В 3D — ДЕТАЛИ ПРИБОРА В МИЛЛИМЕТРАХ, БЕЗ THREE.JS (ЭТАП 3).
 *
 * Модель прибора — не коробка: стеклокерамика с зонами, горелки с
 * рассекателями, чугунные решётки, ручки; у духового шкафа — рамка, панель
 * с дисплеем, дверь со стеклом и ручкой, ступенчатый корпус и камера с
 * направляющими и противнем. Размеры — из файла фактов (габарит, зоны,
 * горелки, ступени корпуса по габаритному чертежу карточки); чего в
 * документах нет (толщина стекла, высота решётки, профиль ручки), — условное
 * число здесь, и сказано это словами (`ApplianceModel.visual`, `SHAPE_NOTES`).
 *
 * Отрисовщик (`ApplianceModels3D`) только переводит эти детали в сетки: одна
 * картина на сцену, приёмку и путь трассировки.
 *
 * Оси прибора: x — вдоль ряда (0 — середина модуля), y — вверх, z — к
 * человеку. У варочной ноль по y — поверхность столешницы, по z — середина
 * панели; у духового шкафа ноль по y — низ шкафа, по z — плоскость фасадов
 * корпуса (тыл рамки), дверь ходит вокруг оси у её нижней кромки.
 */

export type ShapeMaterial =
  | 'glassCeramic'
  | 'zoneLine'
  | 'printWhite'
  | 'stainless'
  | 'stainlessBrushed'
  | 'castIron'
  | 'burnerCap'
  | 'burnerCrown'
  | 'knob'
  | 'blackGlass'
  | 'doorGlass'
  | 'enamel'
  | 'chrome'
  | 'display'
  | 'body'
  | 'rubber';

/** Что едет вместе с дверью духового шкафа. */
export type ShapeMoving = 'ovenDoor';

export type ShapePart =
  | { kind: 'box'; at: [number, number, number]; size: [number, number, number]; material: ShapeMaterial; moving?: ShapeMoving; name?: string }
  /** Цилиндр по вертикали: центр основания — `at`. */
  | { kind: 'cylinder'; at: [number, number, number]; radius: number; height: number; material: ShapeMaterial; segments?: number; moving?: ShapeMoving; name?: string }
  /** Кольцо в плоскости столешницы, лицом вверх. */
  | { kind: 'ring'; at: [number, number, number]; inner: number; outer: number; material: ShapeMaterial; name?: string }
  /** Цилиндр вдоль ряда (ручка, ось петли): центр — `at`. */
  | { kind: 'rod'; at: [number, number, number]; radius: number; length: number; material: ShapeMaterial; moving?: ShapeMoving; name?: string };

/**
 * УСЛОВНЫЕ ЧИСЛА КАРТИНКИ — НЕ ИЗ ДОКУМЕНТОВ. В инструкциях их нет; цех по
 * ним ничего не делает, а сцена без них плоская. Каждое названо.
 */
export const SHAPE_NOTES = {
  /** Толщина стекла индукции над столешницей: панель 51 мм всего, стекло — условно. */
  hobGlassMm: 5,
  /** Лист нержавеющей стали газовой панели. */
  gasPlateMm: 3,
  /** Высота горелки над листом и решётки над горелкой — по фото, условно. */
  burnerHeightMm: 22,
  grateHeightMm: 34,
  grateBarMm: 9,
  /** Ручка газовой панели: Ø — по фото (42), высота условно. */
  knobHeightMm: 24,
  /** Камера духового шкафа 480 × 360 × 410 — объём 71 л из карточки (0,0708 м³), пропорции условно. */
  cavityMm: [480, 360, 410] as [number, number, number],
  /** Ручка двери: длина и место — по фото карточки (PGA1), вылет ≤ 50 по чертежу; сечение условно. */
  handleLengthMm: 483,
  handleFromTopMm: 131,
  handleStandoffMm: 38,
  handleRadiusMm: 9,
  /** Корпус шкафа по ширине: ниша 560 — корпус условно на 4 уже. */
  ovenBodyWidthMm: 556,
};

/** Габарит панели для приёмки: где стекло и сколько зон/горелок нарисовано. */
export type HobShape = { parts: ShapePart[]; cooking: number; knobs: number; grates: number; topMm: number };

/** Варочная панель: модель из фактов либо типовая 590 × 520 — четыре зоны условно. */
export function hobShape(model: ApplianceModel | null, gas: boolean): HobShape {
  const width = model?.sizeMm.width ?? 590;
  const depth = model?.sizeMm.depth ?? 520;
  const below = model?.hob?.builtInDepthMm ?? 45;
  const parts: ShapePart[] = [];
  /* Отметка «от заднего левого угла» → оси прибора. */
  const at = (xy: [number, number], y: number): [number, number, number] => [xy[0] - width / 2, y, xy[1] - depth / 2];

  /* Корпус под столешницей — виден только в вырезе снизу. */
  parts.push({ kind: 'box', at: [0, -below / 2, 0], size: [width - 32, below - 2, depth - 32], material: 'body', name: 'корпус' });

  if (!gas) {
    const glass = SHAPE_NOTES.hobGlassMm;
    parts.push({ kind: 'box', at: [0, glass / 2, 0], size: [width, glass, depth], material: 'glassCeramic', name: 'стеклокерамика' });
    const zones = model?.cooking ?? [
      { diameterMm: 180, kw: 0, atMm: [width * 0.24, depth * 0.27] as [number, number] },
      { diameterMm: 145, kw: 0, atMm: [width * 0.74, depth * 0.24] as [number, number] },
      { diameterMm: 180, kw: 0, atMm: [width * 0.24, depth * 0.68] as [number, number] },
      { diameterMm: 210, kw: 0, atMm: [width * 0.74, depth * 0.64] as [number, number] },
    ];
    for (const zone of zones) {
      const r = zone.diameterMm / 2;
      parts.push({ kind: 'ring', at: at(zone.atMm, glass + 0.4), inner: r - 1.2, outer: r, material: 'zoneLine', name: `зона Ø${zone.diameterMm}` });
      /* Метка зоны спереди — короткая светлая черта, как на фото. */
      parts.push({ kind: 'box', at: at([zone.atMm[0], zone.atMm[1] + r + 1], glass + 0.4), size: [r * 0.55, 0.3, 2.2], material: 'zoneLine', name: 'метка зоны' });
    }
    /* Сенсорная полоса: символы — светлые кружки и черта, по фото карточки. */
    const controls = model?.controlsAtMm ?? [width / 2, depth * 0.9];
    for (let i = 0; i < 7; i += 1) {
      parts.push({ kind: 'ring', at: at([controls[0] - 75 + i * 25, controls[1] + 10], glass + 0.4), inner: 3.2, outer: 4.2, material: 'printWhite', name: 'сенсор' });
    }
    parts.push({ kind: 'box', at: at([controls[0], controls[1] + 22], glass + 0.4), size: [170, 0.3, 0.9], material: 'printWhite', name: 'полоса сенсоров' });
    return { parts, cooking: zones.length, knobs: 0, grates: 0, topMm: glass };
  }

  /* ── Газовая: лист, горелки, решётки, ручки ── */
  const plate = SHAPE_NOTES.gasPlateMm;
  parts.push({ kind: 'box', at: [0, plate / 2, 0], size: [width, plate, depth], material: 'stainlessBrushed', name: 'лист' });
  const burners = model?.cooking ?? [
    { diameterMm: 76, kw: 0, atMm: [width * 0.24, depth * 0.27] as [number, number] },
    { diameterMm: 100, kw: 0, atMm: [width * 0.76, depth * 0.27] as [number, number], wok: true },
    { diameterMm: 76, kw: 0, atMm: [width * 0.24, depth * 0.65] as [number, number] },
    { diameterMm: 52, kw: 0, atMm: [width * 0.76, depth * 0.65] as [number, number] },
  ];
  const H = SHAPE_NOTES.burnerHeightMm;
  for (const burner of burners) {
    const r = burner.diameterMm / 2;
    const c = at(burner.atMm, plate);
    /* Светлое кольцо чаши вокруг горелки — по фото. */
    parts.push({ kind: 'ring', at: [c[0], plate + 0.3, c[2]], inner: r * 1.08, outer: r * 1.85, material: 'stainless', name: 'чаша горелки' });
    parts.push({ kind: 'cylinder', at: c, radius: r * 0.92, height: H - 6, material: 'burnerCrown', segments: 32, name: 'рассекатель' });
    parts.push({ kind: 'cylinder', at: [c[0], plate + H - 6, c[2]], radius: r, height: 6, material: 'burnerCap', segments: 40, name: burner.wok ? 'крышка wok' : 'крышка горелки' });
    if (burner.wok) {
      parts.push({ kind: 'cylinder', at: [c[0], plate + H, c[2]], radius: r * 0.45, height: 4, material: 'burnerCap', segments: 32, name: 'внутренняя крышка wok' });
    }
  }
  /* Чугунные решётки: рама и пальцы к центрам горелок. */
  const grates = model?.grates ?? 2;
  const grateTop = plate + SHAPE_NOTES.grateHeightMm;
  const bar = SHAPE_NOTES.grateBarMm;
  const usable = width - 30;
  const grateW = usable / grates;
  const grateD = depth * 0.82;
  const grateZ = -depth * 0.06;
  for (let g = 0; g < grates; g += 1) {
    const cx = -usable / 2 + grateW * (g + 0.5);
    const y = grateTop - bar / 2;
    parts.push({ kind: 'box', at: [cx, y, grateZ - grateD / 2 + bar / 2], size: [grateW - 8, bar, bar], material: 'castIron', name: 'решётка' });
    parts.push({ kind: 'box', at: [cx, y, grateZ + grateD / 2 - bar / 2], size: [grateW - 8, bar, bar], material: 'castIron', name: 'решётка' });
    parts.push({ kind: 'box', at: [cx - grateW / 2 + 4 + bar / 2, y, grateZ], size: [bar, bar, grateD], material: 'castIron', name: 'решётка' });
    parts.push({ kind: 'box', at: [cx + grateW / 2 - 4 - bar / 2, y, grateZ], size: [bar, bar, grateD], material: 'castIron', name: 'решётка' });
    /* Ножки решётки. */
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push({ kind: 'box', at: [cx + sx * (grateW / 2 - 12), plate + (grateTop - plate - bar) / 2, grateZ + sz * (grateD / 2 - 8)], size: [8, grateTop - plate - bar, 8], material: 'rubber', name: 'ножка решётки' });
      }
    }
    /* Пальцы к горелкам этой решётки: крест из четырёх. */
    for (const burner of burners) {
      const c = at(burner.atMm, 0);
      if (c[0] < cx - grateW / 2 || c[0] > cx + grateW / 2) continue;
      const r = burner.diameterMm / 2 + 12;
      const reach = Math.max(10, Math.min(grateW / 2 - 6, grateD / 2 - 6) - r);
      parts.push({ kind: 'box', at: [c[0] - r - reach / 2, y, c[2]], size: [reach, bar, bar], material: 'castIron', name: 'палец решётки' });
      parts.push({ kind: 'box', at: [c[0] + r + reach / 2, y, c[2]], size: [reach, bar, bar], material: 'castIron', name: 'палец решётки' });
      parts.push({ kind: 'box', at: [c[0], y, c[2] - r - reach / 2], size: [bar, bar, reach], material: 'castIron', name: 'палец решётки' });
      parts.push({ kind: 'box', at: [c[0], y, c[2] + r + reach / 2], size: [bar, bar, reach], material: 'castIron', name: 'палец решётки' });
    }
  }
  /* Ручки: по фото карточки, на передней кромке. */
  const knobs = model?.knobsAtMm ?? { y: depth * 0.9, x: [width * 0.35, width * 0.45, width * 0.55, width * 0.65], diameterMm: 42 };
  for (const x of knobs.x) {
    const c = at([x, knobs.y], plate);
    parts.push({ kind: 'cylinder', at: c, radius: knobs.diameterMm / 2, height: SHAPE_NOTES.knobHeightMm, material: 'knob', segments: 36, name: 'ручка' });
    parts.push({ kind: 'box', at: [c[0], plate + SHAPE_NOTES.knobHeightMm + 3, c[2]], size: [knobs.diameterMm * 0.82, 6, 7], material: 'knob', name: 'гребень ручки' });
  }
  return { parts, cooking: burners.length, knobs: knobs.x.length, grates, topMm: grateTop };
}

export type OvenShape = {
  parts: ShapePart[];
  /**
   * Дверь: полотно и ось хода в осях шкафа. Ось — нижняя кромка полотна
   * СПЕРЕДИ: открытая дверь ложится над осью и в фасад под шкафом не уходит.
   * Кинематики петли в документах нет — ось и ход 90° условные, одни на сцену
   * (`ApplianceModels3D`) и проверку хода (`applianceDoorSweep`).
   */
  door: { heightMm: number; widthMm: number; thicknessMm: number; pivotMm: [number, number, number] };
  cavityLitres: number;
};

/** Духовой шкаф: модель из фактов либо типовой 594 × 595 — ступенчатый корпус условно. */
export function ovenShape(model: ApplianceModel | null): OvenShape {
  const width = model?.sizeMm.width ?? 594;
  const height = model?.sizeMm.height ?? 595;
  const bodyDepth = model?.sizeMm.depth ?? 548;
  const o = model?.oven;
  const frame = o?.frameMm ?? 19.5;
  const panel = o?.panelHeightMm ?? 96;
  const frontBody = o?.bodyFrontMm ?? { height: 570, depth: 405 };
  const rearH = o?.bodyRearHeightMm ?? 535;
  const bodyW = SHAPE_NOTES.ovenBodyWidthMm;
  const parts: ShapePart[] = [];
  const doorH = height - panel;

  /* Корпус: ступенька по габаритному чертежу (570 на 405 от рамки, сзади 535). */
  parts.push({ kind: 'box', at: [0, frontBody.height / 2, -frontBody.depth / 2], size: [bodyW, frontBody.height, frontBody.depth], material: 'body', name: 'корпус спереди' });
  parts.push({ kind: 'box', at: [0, rearH / 2, -frontBody.depth - (bodyDepth - frontBody.depth) / 2], size: [bodyW, rearH, bodyDepth - frontBody.depth], material: 'body', name: 'корпус сзади' });

  /* Панель управления: чёрное стекло, дисплей и сенсоры. */
  parts.push({ kind: 'box', at: [0, height - panel / 2, frame / 2], size: [width, panel, frame], material: 'blackGlass', name: 'панель управления' });
  parts.push({ kind: 'box', at: [0, height - 1.5, frame / 2], size: [width, 3, frame + 0.6], material: 'stainless', name: 'кромка панели' });
  parts.push({ kind: 'box', at: [0, height - panel * 0.42, frame + 0.4], size: [118, 26, 0.8], material: 'display', name: 'дисплей' });
  /* Сенсоры — метки на стекле панели (лицом к человеку), а не диски поперёк неё. */
  for (let i = 0; i < 8; i += 1) {
    const sx = i < 4 ? -150 + i * 34 : 48 + (i - 4) * 34;
    parts.push({ kind: 'box', at: [sx, height - panel * 0.72, frame + 0.4], size: [7, 7, 0.8], material: 'printWhite', name: 'сенсор' });
  }

  /* Дверь — едет вокруг нижней оси: полотно, окно, ручка, петли. */
  const cavity = SHAPE_NOTES.cavityMm;
  parts.push({ kind: 'box', at: [0, doorH / 2, frame / 2], size: [width, doorH, frame], material: 'blackGlass', moving: 'ovenDoor', name: 'дверь' });
  parts.push({ kind: 'box', at: [0, doorH * 0.43, frame + 0.4], size: [cavity[0] - 20, cavity[1] - 10, 0.8], material: 'doorGlass', moving: 'ovenDoor', name: 'окно двери' });
  const handleY = height - SHAPE_NOTES.handleFromTopMm;
  const standoff = Math.min(SHAPE_NOTES.handleStandoffMm, o?.handleMaxMm ?? 50);
  parts.push({ kind: 'rod', at: [0, handleY, frame + standoff], radius: SHAPE_NOTES.handleRadiusMm, length: SHAPE_NOTES.handleLengthMm, material: 'stainless', moving: 'ovenDoor', name: 'ручка' });
  for (const sx of [-1, 1]) {
    parts.push({ kind: 'box', at: [sx * (SHAPE_NOTES.handleLengthMm / 2 - 20), handleY, frame + standoff / 2], size: [14, 14, standoff], material: 'stainless', moving: 'ovenDoor', name: 'держатель ручки' });
  }
  for (const sx of [-1, 1]) {
    parts.push({ kind: 'box', at: [sx * (width / 2 - 40), 18, -6], size: [12, 22, 14], material: 'chrome', name: 'петля двери' });
  }

  /* Камера: эмаль, решётки направляющих, противень, вентилятор — видно при открытой двери. */
  const cavityBottom = 62;
  const [cw, ch, cd] = cavity;
  const wall = 3;
  parts.push({ kind: 'box', at: [0, cavityBottom - wall / 2, -cd / 2], size: [cw, wall, cd], material: 'enamel', name: 'дно камеры' });
  parts.push({ kind: 'box', at: [0, cavityBottom + ch + wall / 2, -cd / 2], size: [cw, wall, cd], material: 'enamel', name: 'свод камеры' });
  parts.push({ kind: 'box', at: [-cw / 2 - wall / 2, cavityBottom + ch / 2, -cd / 2], size: [wall, ch, cd], material: 'enamel', name: 'стенка камеры' });
  parts.push({ kind: 'box', at: [cw / 2 + wall / 2, cavityBottom + ch / 2, -cd / 2], size: [wall, ch, cd], material: 'enamel', name: 'стенка камеры' });
  parts.push({ kind: 'box', at: [0, cavityBottom + ch / 2, -cd - wall / 2], size: [cw, ch, wall], material: 'enamel', name: 'задняя стенка камеры' });
  parts.push({ kind: 'cylinder', at: [0, cavityBottom + ch / 2 - 0.5, -cd + 3], radius: 95, height: 1, material: 'chrome', segments: 40, name: 'кожух вентилятора' });
  for (let level = 0; level < 5; level += 1) {
    const y = cavityBottom + 55 + level * 58;
    for (const sx of [-1, 1]) {
      parts.push({ kind: 'box', at: [sx * (cw / 2 - 12), y, -cd / 2], size: [5, 5, cd - 40], material: 'chrome', name: 'направляющая' });
    }
  }
  parts.push({ kind: 'box', at: [0, cavityBottom + 55 + 58 + 6, -cd / 2], size: [cw - 40, 12, cd - 50], material: 'enamel', name: 'противень' });

  return {
    parts,
    door: { heightMm: doorH, widthMm: width, thicknessMm: frame, pivotMm: [0, 0, frame] },
    cavityLitres: Math.round(((cw * ch * cd) / 1e6) * 10) / 10,
  };
}
