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

/**
 * Что едет: `ovenDoor` — дверь духового шкафа; у техники этапа 4 — ключ
 * своего хода (`ModelShape.movers`): дверь СВЧ, двери холодильника,
 * корзины посудомойки, экран вытяжки.
 */
export type ShapeMoving = string;

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

  /*
   * Корпус под столешницей — виден только в вырезе снизу. Низ — ровно на
   * глубине встраивания (`builtInDepthMm`): та же отметка, что
   * `cookingStackOf.hobBottomMm` меряет до шкафа под панелью; верх — на 1 мм
   * под поверхностью плиты, чтобы не спорить с ней в одном пикселе.
   */
  parts.push({ kind: 'box', at: [0, -(below + 1) / 2, 0], size: [width - 32, below - 1, depth - 32], material: 'body', name: 'корпус' });

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

/* ─────────────────────────  техника этапа 4  ───────────────────────── */

/**
 * ХОД ДЕТАЛИ ПРИБОРА (ЭТАП 4): дверь на оси (`hinge`) или выдвижение (`slide`).
 * Ключ — суффикс к id модуля (`<модуль>:<ключ>`), тот же, что у «Открыть всё».
 * `after` — ход начинается, только когда открыта эта деталь (корзины — за
 * дверью посудомойки).
 */
export type ShapeMover =
  | { key: string; kind: 'hinge'; axis: 'x' | 'y'; pivotMm: [number, number, number]; angle: number }
  | { key: string; kind: 'slide'; offsetMm: [number, number, number]; after?: string };

export type ModelShape = { parts: ShapePart[]; movers: ShapeMover[] };

/** Условные числа моделей этапа 4 — в документах их нет, сказано у модели (`visual`). */
export const MODEL_NOTES = {
  /** Толщина рамки и двери СВЧ — условно 20 мм; сторона петель в документах не указана — слева. */
  microwaveFrontMm: 20,
  /** Ширина панели управления СВЧ справа — по рис. с. 7, условно. */
  microwavePanelMm: 120,
  /** Камера 20 л — 330 × 210 × 290 мм (0,0201 м³), пропорции условно; подставка Ø245 — условно. */
  microwaveCavityMm: [330, 210, 290] as [number, number, number],
  turntableMm: 245,
  /** Двери отдельностоящего холодильника: морозильная — 700 мм снизу, условно (в документах нет). */
  freezerDoorMm: 700,
  fridgeDoorMm: 50,
  /** Ход экрана вытяжки — в документах нет: условно 150 мм. */
  hoodScreenTravelMm: 150,
  /** Ход корзин посудомойки — условно на 0,8 глубины камеры. */
  basketTravel: 0.8,
};

/**
 * ВСТРАИВАЕМАЯ СВЧ (BFL524MB2): корпус в нише, дверь со стеклом на петлях
 * слева, панель справа с кнопкой, камера и вращающаяся подставка. Ноль по y —
 * низ прибора, по z — плоскость фасадов корпуса; дверь ходит вокруг
 * вертикальной оси у левой кромки на 90° к человеку.
 */
export function microwaveShape(model: ApplianceModel | null): ModelShape {
  const width = model?.sizeMm.width ?? 594;
  const height = model?.sizeMm.height ?? 382;
  const depth = model?.sizeMm.depth ?? 317;
  const front = MODEL_NOTES.microwaveFrontMm;
  const panel = MODEL_NOTES.microwavePanelMm;
  const doorW = width - panel;
  const [cw, ch, cd] = MODEL_NOTES.microwaveCavityMm;
  const parts: ShapePart[] = [];
  const bodyW = Math.min(556, width - 20);
  parts.push({ kind: 'box', at: [0, height / 2, -(depth - front) / 2], size: [bodyW, height - 12, depth - front], material: 'body', name: 'корпус' });
  /* Панель управления справа: чёрное стекло, дисплей, кнопка открывания. */
  const panelX = width / 2 - panel / 2;
  parts.push({ kind: 'box', at: [panelX, height / 2, front / 2], size: [panel, height, front], material: 'blackGlass', name: 'панель' });
  parts.push({ kind: 'box', at: [panelX, height * 0.72, front + 0.4], size: [70, 22, 0.8], material: 'display', name: 'дисплей' });
  parts.push({ kind: 'box', at: [panelX, height * 0.3, front + 1], size: [26, 26, 2], material: 'chrome', name: 'кнопка открывания' });
  /* Камера: эмаль и подставка — видно при открытой двери. */
  const cx = -panel / 2;
  const bottom = (height - ch) / 2;
  const wall = 3;
  parts.push({ kind: 'box', at: [cx, bottom - wall / 2, -cd / 2], size: [cw, wall, cd], material: 'enamel', name: 'дно камеры' });
  parts.push({ kind: 'box', at: [cx, bottom + ch + wall / 2, -cd / 2], size: [cw, wall, cd], material: 'enamel', name: 'свод камеры' });
  parts.push({ kind: 'box', at: [cx - cw / 2 - wall / 2, bottom + ch / 2, -cd / 2], size: [wall, ch, cd], material: 'enamel', name: 'стенка камеры' });
  parts.push({ kind: 'box', at: [cx + cw / 2 + wall / 2, bottom + ch / 2, -cd / 2], size: [wall, ch, cd], material: 'enamel', name: 'стенка камеры' });
  parts.push({ kind: 'box', at: [cx, bottom + ch / 2, -cd - wall / 2], size: [cw, ch, wall], material: 'enamel', name: 'задняя стенка камеры' });
  parts.push({ kind: 'cylinder', at: [cx, bottom + 6, -cd / 2], radius: MODEL_NOTES.turntableMm / 2, height: 4, material: 'doorGlass', segments: 40, name: 'подставка' });
  /* Дверь: полотно чёрного стекла и окно. */
  const left = -width / 2;
  parts.push({ kind: 'box', at: [left + doorW / 2, height / 2, front / 2], size: [doorW, height, front], material: 'blackGlass', moving: 'microwave:door', name: 'дверь' });
  parts.push({ kind: 'box', at: [left + doorW / 2 + 10, height / 2, front + 0.4], size: [doorW - 90, height - 110, 0.8], material: 'doorGlass', moving: 'microwave:door', name: 'окно двери' });
  return {
    parts,
    movers: [{ key: 'microwave:door', kind: 'hinge', axis: 'y', pivotMm: [left, 0, front], angle: -Math.PI / 2 }],
  };
}

/**
 * ОТДЕЛЬНОСТОЯЩИЙ ХОЛОДИЛЬНИК (KGN39LB30U): корпус, две двери на петлях
 * справа, полки, полки на двери, ящики морозильной камеры. Ноль по y — пол,
 * по z — перед двери; двери — вокруг вертикальной оси у кромки петель.
 */
export function freestandingFridgeShape(model: ApplianceModel): ModelShape {
  const { width, height } = model.sizeMm;
  const f = model.fridge!;
  const door = MODEL_NOTES.fridgeDoorMm;
  const body = f.bodyDepthMm ?? model.sizeMm.depth - door;
  const freezer = MODEL_NOTES.freezerDoorMm;
  const parts: ShapePart[] = [];
  const zBody = -door - body / 2;
  const wall = 30;
  parts.push({ kind: 'box', at: [-width / 2 + wall / 2, height / 2, zBody], size: [wall, height, body], material: 'body', name: 'боковина' });
  parts.push({ kind: 'box', at: [width / 2 - wall / 2, height / 2, zBody], size: [wall, height, body], material: 'body', name: 'боковина' });
  parts.push({ kind: 'box', at: [0, height - wall / 2, zBody], size: [width, wall, body], material: 'body', name: 'крыша' });
  parts.push({ kind: 'box', at: [0, (wall + 80) / 2, zBody], size: [width, wall + 80, body], material: 'body', name: 'низ' });
  parts.push({ kind: 'box', at: [0, freezer + wall / 2, zBody], size: [width, wall, body], material: 'body', name: 'перегородка' });
  parts.push({ kind: 'box', at: [0, height / 2, -door - body + 10], size: [width - 2 * wall, height, 20], material: 'printWhite', name: 'задняя стенка камеры' });
  const innerW = width - 2 * wall;
  for (let i = 0; i < f.shelves; i += 1) {
    const y = freezer + 120 + i * ((height - freezer - 200) / f.shelves);
    parts.push({ kind: 'box', at: [0, y, zBody + 10], size: [innerW - 6, 5, body - 40], material: 'doorGlass', name: 'полка' });
  }
  for (let i = 0; i < f.freezerDrawers; i += 1) {
    const h = (freezer - 160) / f.freezerDrawers;
    parts.push({ kind: 'box', at: [0, 130 + h * i + h / 2, zBody + 20], size: [innerW - 10, h - 14, body - 60], material: 'printWhite', name: 'ящик морозильной камеры' });
  }
  /* Двери: морозильная внизу, холодильная выше; ручка встроенная — полосой у кромки без петель. */
  const sign = f.hinge === 'right' ? 1 : -1;
  const gripX = -sign * (width / 2 - 12);
  const fridgeH = height - freezer - 4;
  parts.push({ kind: 'box', at: [0, freezer / 2, -door / 2], size: [width, freezer - 4, door], material: 'blackGlass', moving: 'fridge:door:1', name: 'дверь морозильной' });
  parts.push({ kind: 'box', at: [gripX, freezer * 0.7, 1], size: [10, 160, 2], material: 'stainless', moving: 'fridge:door:1', name: 'ручка' });
  parts.push({ kind: 'box', at: [0, freezer + fridgeH / 2 + 4, -door / 2], size: [width, fridgeH, door], material: 'blackGlass', moving: 'fridge:door:0', name: 'дверь холодильной' });
  parts.push({ kind: 'box', at: [gripX, freezer + 260, 1], size: [10, 300, 2], material: 'stainless', moving: 'fridge:door:0', name: 'ручка' });
  for (let i = 0; i < f.doorShelves; i += 1) {
    const y = freezer + 200 + i * ((fridgeH - 300) / f.doorShelves);
    parts.push({ kind: 'box', at: [0, y, -door - 45], size: [innerW - 60, 70, 80], material: 'printWhite', moving: 'fridge:door:0', name: 'полка на двери' });
  }
  return {
    parts,
    movers: [
      { key: 'fridge:door:0', kind: 'hinge', axis: 'y', pivotMm: [(sign * width) / 2, 0, 0], angle: (sign * Math.PI) / 2 },
      { key: 'fridge:door:1', kind: 'hinge', axis: 'y', pivotMm: [(sign * width) / 2, 0, 0], angle: (sign * Math.PI) / 2 },
    ],
  };
}

/**
 * ВСТРАИВАЕМЫЙ ХОЛОДИЛЬНИК (KIN86AF3M8) В КОЛОННЕ: камера за мебельным
 * фасадом — полки и ящики морозильной камеры; дверь прибора — на мебельном
 * фасаде («дверь на дверь») и ходит с ним. Ноль по y — дно ниши, по z —
 * плоскость фасадов корпуса.
 */
export function builtInFridgeShape(model: ApplianceModel): ModelShape {
  const { width, height, depth } = model.sizeMm;
  const f = model.fridge!;
  const parts: ShapePart[] = [];
  const wall = 28;
  const d = depth - 30;
  const zBody = -30 - d / 2;
  parts.push({ kind: 'box', at: [-width / 2 + wall / 2, height / 2, zBody], size: [wall, height, d], material: 'printWhite', name: 'стенка камеры' });
  parts.push({ kind: 'box', at: [width / 2 - wall / 2, height / 2, zBody], size: [wall, height, d], material: 'printWhite', name: 'стенка камеры' });
  parts.push({ kind: 'box', at: [0, height - wall / 2, zBody], size: [width, wall, d], material: 'printWhite', name: 'свод' });
  parts.push({ kind: 'box', at: [0, wall / 2, zBody], size: [width, wall, d], material: 'printWhite', name: 'дно' });
  parts.push({ kind: 'box', at: [0, height / 2, -depth + 10], size: [width, height, 20], material: 'printWhite', name: 'задняя стенка' });
  const freezer = Math.round(height * 0.4);
  parts.push({ kind: 'box', at: [0, freezer, zBody], size: [width, wall, d], material: 'printWhite', name: 'перегородка' });
  const innerW = width - 2 * wall;
  for (let i = 0; i < f.shelves; i += 1) {
    const y = freezer + 120 + i * ((height - freezer - 180) / f.shelves);
    parts.push({ kind: 'box', at: [0, y, zBody], size: [innerW - 6, 5, d - 30], material: 'doorGlass', name: 'полка' });
  }
  for (let i = 0; i < f.freezerDrawers; i += 1) {
    const h = (freezer - 60) / f.freezerDrawers;
    parts.push({ kind: 'box', at: [0, 40 + h * i + h / 2, zBody + 10], size: [innerW - 10, h - 14, d - 50], material: 'stainlessBrushed', name: 'ящик морозильной камеры' });
  }
  return { parts, movers: [] };
}

/**
 * ПОЛНОВСТРАИВАЕМАЯ ПОСУДОМОЙКА (SMV4HMX25Q, SPV4HMX14Q): камера из нержавейки
 * и корзины за мебельным фасадом. Дверь прибора — на фасаде, ходит с ним вниз
 * (`doorOpening` → `flap`); корзины выезжают, когда фасад открыт. Ноль по y — пол.
 */
export function dishwasherShape(model: ApplianceModel, frontKey: string): ModelShape {
  const { width, height, depth } = model.sizeMm;
  const dw = model.dishwasher!;
  const parts: ShapePart[] = [];
  const wall = 4;
  const bottom = 90;
  const tubH = height - bottom - 40;
  const d = depth - 60;
  const zc = -40 - d / 2;
  const w = width - 40;
  parts.push({ kind: 'box', at: [0, bottom / 2, zc], size: [width, bottom, d], material: 'body', name: 'основание' });
  parts.push({ kind: 'box', at: [-w / 2 - wall / 2, bottom + tubH / 2, zc], size: [wall, tubH, d], material: 'stainlessBrushed', name: 'стенка камеры' });
  parts.push({ kind: 'box', at: [w / 2 + wall / 2, bottom + tubH / 2, zc], size: [wall, tubH, d], material: 'stainlessBrushed', name: 'стенка камеры' });
  parts.push({ kind: 'box', at: [0, bottom + tubH + wall / 2, zc], size: [w, wall, d], material: 'stainlessBrushed', name: 'свод камеры' });
  parts.push({ kind: 'box', at: [0, bottom - wall / 2, zc], size: [w, wall, d], material: 'stainlessBrushed', name: 'дно камеры' });
  parts.push({ kind: 'box', at: [0, bottom + tubH / 2, -40 - d - wall / 2], size: [w, tubH, wall], material: 'stainlessBrushed', name: 'задняя стенка камеры' });
  const basketKey = 'dishwasher:baskets';
  /* Нижняя и верхняя корзины, у 60 см — ещё полка для приборов под сводом. */
  const half = (tubH - 80) / 2;
  const levels: { y: number; h: number; name: string }[] = [
    { y: bottom + 30, h: half - 40, name: 'нижняя корзина' },
    { y: bottom + 40 + half, h: half - 60, name: 'верхняя корзина' },
  ];
  if (dw.baskets >= 3) levels.push({ y: bottom + tubH - 60, h: 40, name: 'полка для приборов' });
  for (const level of levels) {
    const cy = level.y + level.h / 2;
    parts.push({ kind: 'box', at: [0, level.y + 2, zc + 10], size: [w - 30, 4, d - 40], material: 'chrome', moving: basketKey, name: level.name });
    for (const sx of [-1, 1]) {
      parts.push({ kind: 'box', at: [sx * (w / 2 - 17), cy, zc + 10], size: [4, level.h, d - 40], material: 'chrome', moving: basketKey, name: 'борт корзины' });
    }
    parts.push({ kind: 'box', at: [0, cy, zc + 10 + (d - 40) / 2], size: [w - 30, level.h, 4], material: 'chrome', moving: basketKey, name: 'борт корзины' });
  }
  return {
    parts,
    movers: [{ key: basketKey, kind: 'slide', offsetMm: [0, 0, Math.round(d * MODEL_NOTES.basketTravel)], after: frontKey }],
  };
}

/**
 * ВСТРАИВАЕМАЯ ВЫТЯЖКА С ВЫДВИЖНЫМ ЭКРАНОМ (DFT63CA60Q): короб в шкафу (в
 * сцене его закрывает корпус), под дном шкафа — 40 мм прибора (175 − 135, рис.
 * A): жироулавливающий фильтр, свет и выдвижной экран. Ноль по y — дно
 * навесного шкафа, по z — плоскость фасадов корпуса.
 */
export function hoodShape(model: ApplianceModel): ModelShape {
  const h = model.hood!;
  const width = h.installWidthMm;
  const below = h.totalHeightMm - h.boxHeightMm;
  const depth = h.bodyDepthMm;
  const parts: ShapePart[] = [];
  const z = -depth / 2;
  parts.push({ kind: 'box', at: [0, -below / 2, z - 20], size: [width, below, depth - 40], material: 'body', name: 'короб под шкафом' });
  parts.push({ kind: 'box', at: [0, -below - 0.5, z - 20], size: [width - 80, 1, depth - 90], material: 'stainlessBrushed', name: 'жироулавливающий фильтр' });
  for (const sx of [-1, 1]) {
    parts.push({ kind: 'box', at: [sx * (width / 2 - 70), -below - 0.6, z - 40], size: [40, 1, 40], material: 'printWhite', name: 'свет' });
  }
  parts.push({ kind: 'box', at: [0, -below / 2, -10], size: [width, below, 20], material: 'blackGlass', moving: 'hood:screen', name: 'выдвижной экран' });
  parts.push({ kind: 'box', at: [width / 2 - 60, -below / 2, 0.4], size: [40, 8, 0.8], material: 'stainless', moving: 'hood:screen', name: 'ползунок скоростей' });
  return {
    parts,
    movers: [{ key: 'hood:screen', kind: 'slide', offsetMm: [0, 0, h.screenTravelMm ?? MODEL_NOTES.hoodScreenTravelMm] }],
  };
}
