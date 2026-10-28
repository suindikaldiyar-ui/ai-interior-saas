/**
 * РАДИУСНАЯ МЕБЕЛЬ — ОДНА ГЕОМЕТРИЯ НА СЦЕНУ, РАСКРОЙ И СМЕТУ (OVAL & RADIUS, этап A).
 *
 * До этого этапа радиус был подписью фасада: в сцене, раскрое, смете и на
 * чертеже лежал плоский прямоугольник, а пресет «Эмаль с радиусом» обещал
 * гнутые торцы. Здесь форма модуля в плане — путь из отрезков и дуг
 * (`moduleOutline`), а детали — `radiusParts`: дно, крыша и полки по контуру
 * (заготовка с листа, контур — ЧПУ), гнутая дверца, гнутый цоколь, подложка
 * и рейки. Сцена ставит их коробками с истинной формой (`radiusModuleBoxes`),
 * раскрой режет те же детали (`radiusModulePanels`) — второй геометрии нет.
 *
 * Координаты модуля, мм: x — вдоль ряда от левого края модуля; z — 0 на
 * передней плоскости корпуса, минус — к стене; y — от низа корпуса. Углы дуг
 * — от +x к +z, радианы.
 *
 * Без three.js: модуль читают смета, раскрой и чертёж.
 */
import type { Module, RadiusSpec } from '@/types/millwork';

/* ─────────────────────────  Путь в плане  ───────────────────────── */

/** Точка плана, мм: [x, z]. */
export type PlanPoint = readonly [number, number];

/** Отрезок или дуга. Дуга идёт от угла `from` к углу `to` (знак — направление обхода). */
export type PathSeg =
  | { kind: 'line'; a: PlanPoint; b: PlanPoint }
  | { kind: 'arc'; c: PlanPoint; r: number; from: number; to: number };

/** Замкнутый путь: конец последнего отрезка — начало первого. */
export type PlanPath = PathSeg[];

const EPS = 1e-6;

export function arcPoint(seg: Extract<PathSeg, { kind: 'arc' }>, angle: number): PlanPoint {
  return [seg.c[0] + seg.r * Math.cos(angle), seg.c[1] + seg.r * Math.sin(angle)];
}

export function segStart(seg: PathSeg): PlanPoint {
  return seg.kind === 'line' ? seg.a : arcPoint(seg, seg.from);
}

export function segEnd(seg: PathSeg): PlanPoint {
  return seg.kind === 'line' ? seg.b : arcPoint(seg, seg.to);
}

export function segLength(seg: PathSeg): number {
  return seg.kind === 'line' ? Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]) : seg.r * Math.abs(seg.to - seg.from);
}

export function pathLength(path: PlanPath): number {
  return path.reduce((sum, seg) => sum + segLength(seg), 0);
}

/** Длина дуг пути — по ней фрезеруют контур и клеят кромку по дуге. */
export function curvedLengthOf(path: PlanPath): number {
  return path.reduce((sum, seg) => sum + (seg.kind === 'arc' ? segLength(seg) : 0), 0);
}

/**
 * ПЛОЩАДЬ ПО КОНТУРУ — ТОЧНО, ФОРМУЛОЙ ГРИНА, а не по точкам.
 *
 * Отрезок: ½(x_a·z_b − x_b·z_a). Дуга: ½[r²(t₁ − t₀) + r(cx(sin t₁ − sin t₀) −
 * cz(cos t₁ − cos t₀))]. Знак — обход; площадь — по модулю.
 */
export function pathArea(path: PlanPath): number {
  let twice = 0;
  for (const seg of path) {
    if (seg.kind === 'line') {
      twice += seg.a[0] * seg.b[1] - seg.b[0] * seg.a[1];
    } else {
      const { c, r, from, to } = seg;
      twice += r * r * (to - from) + r * (c[0] * (Math.sin(to) - Math.sin(from)) - c[1] * (Math.cos(to) - Math.cos(from)));
    }
  }
  return Math.abs(twice) / 2;
}

/** Попадает ли угол в обход дуги (с концами). */
function angleOnArc(seg: Extract<PathSeg, { kind: 'arc' }>, angle: number): boolean {
  const lo = Math.min(seg.from, seg.to);
  const hi = Math.max(seg.from, seg.to);
  for (let k = -2; k <= 2; k += 1) {
    const a = angle + k * 2 * Math.PI;
    if (a >= lo - EPS && a <= hi + EPS) return true;
  }
  return false;
}

export type PlanBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Габарит пути — точный: концы отрезков и крайние точки дуг внутри обхода. */
export function pathBounds(path: PlanPath): PlanBounds {
  const out: PlanBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const take = (p: PlanPoint) => {
    out.minX = Math.min(out.minX, p[0]);
    out.maxX = Math.max(out.maxX, p[0]);
    out.minZ = Math.min(out.minZ, p[1]);
    out.maxZ = Math.max(out.maxZ, p[1]);
  };
  for (const seg of path) {
    take(segStart(seg));
    take(segEnd(seg));
    if (seg.kind === 'arc') {
      for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        if (angleOnArc(seg, angle)) take(arcPoint(seg, angle));
      }
    }
  }
  return out;
}

/**
 * ТОЧКИ ПУТИ — для сетки сцены и для листа. Дуга дробится так, чтобы хорда
 * отходила от дуги не больше чем на `toleranceMm`: на радиусе 300 мм и
 * допуске 0,5 мм это 30 точек на четверть окружности.
 */
export function samplePath(path: PlanPath, toleranceMm = 0.5): PlanPoint[] {
  const out: PlanPoint[] = [];
  for (const seg of path) {
    if (seg.kind === 'line') {
      out.push(seg.a);
      continue;
    }
    const sweep = seg.to - seg.from;
    const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - toleranceMm / Math.max(seg.r, EPS))));
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-3)));
    for (let i = 0; i < n; i += 1) out.push(arcPoint(seg, seg.from + (sweep * i) / n));
  }
  /* Совпадающие подряд точки (стык отрезка и дуги) — одна точка. */
  return out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length];
    return i === 0 || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4;
  });
}

export function translatePath(path: PlanPath, dx: number, dz: number): PlanPath {
  const t = (p: PlanPoint): PlanPoint => [p[0] + dx, p[1] + dz];
  return path.map((seg) => (seg.kind === 'line' ? { kind: 'line', a: t(seg.a), b: t(seg.b) } : { ...seg, c: t(seg.c) }));
}

/**
 * ЗЕРКАЛО ПО ШИРИНЕ МОДУЛЯ: x → W − x. Точка дуги на угле a уходит на угол
 * π − a той же окружности, отражённой по центру. Левый торец — зеркало
 * правого: двух формул одной формы нет.
 */
export function mirrorPath(path: PlanPath, W: number): PlanPath {
  return path.map((seg) =>
    seg.kind === 'line'
      ? { kind: 'line', a: [W - seg.a[0], seg.a[1]], b: [W - seg.b[0], seg.b[1]] }
      : { kind: 'arc', c: [W - seg.c[0], seg.c[1]], r: seg.r, from: Math.PI - seg.from, to: Math.PI - seg.to },
  );
}

/** Отрезок, если он не нулевой. */
function line(a: PlanPoint, b: PlanPoint): PathSeg[] {
  return Math.hypot(b[0] - a[0], b[1] - a[1]) > EPS ? [{ kind: 'line', a, b }] : [];
}

/** Дуга, если у неё есть радиус. */
function arc(c: PlanPoint, r: number, from: number, to: number): PathSeg[] {
  return r > EPS && Math.abs(to - from) > EPS ? [{ kind: 'arc', c, r, from, to }] : [];
}

/** Отрезок и дуга пути — для контуров, которые строит не этот файл (плита столешницы). */
export const pathLine = line;
export const pathArc = arc;

/**
 * ПРЯМОУГОЛЬНИК СО СКРУГЛЁННЫМИ УГЛАМИ — обход по часовой (x вправо, z вверх):
 * фасад слева направо, правая сторона к стене, задняя справа налево, левая
 * от стены. `zBack` — у стены, `zFront` — фасад. Радиус угла 0 — прямой угол.
 *
 * Скругление угла — четверть окружности, касательная к обеим сторонам: так
 * прямой участок и дуга сопрягаются без излома (это и проверяет приёмка).
 */
export function roundedRectPath(
  x0: number,
  x1: number,
  zBack: number,
  zFront: number,
  corners: { fl?: number; fr?: number; bl?: number; br?: number },
): PlanPath {
  const fl = corners.fl ?? 0;
  const fr = corners.fr ?? 0;
  const bl = corners.bl ?? 0;
  const br = corners.br ?? 0;
  const H = Math.PI / 2;
  return [
    ...line([x0 + fl, zFront], [x1 - fr, zFront]),
    ...arc([x1 - fr, zFront - fr], fr, H, 0),
    ...line([x1, zFront - fr], [x1, zBack + br]),
    ...arc([x1 - br, zBack + br], br, 0, -H),
    ...line([x1 - br, zBack], [x0 + bl, zBack]),
    ...arc([x0 + bl, zBack + bl], bl, -H, -Math.PI),
    ...line([x0, zBack + bl], [x0, zFront - fl]),
    ...arc([x0 + fl, zFront - fl], fl, Math.PI, H),
  ];
}

/**
 * СТРЕЛКА ДУГИ — насколько дуга радиуса `r` над хордой `chord` отходит от
 * неё посередине. Хорда шире диаметра — дуги нет (`NaN`).
 */
export function sagittaMm(r: number, chord: number): number {
  const h = chord / 2;
  return r >= h ? r - Math.sqrt(r * r - h * h) : Number.NaN;
}

/** Центр дуги фасада: выпуклая — центр за фасадом, вогнутая — перед ним. */
export function frontArcCenter(widthMm: number, radiusMm: number, convex: boolean, zFront = 0): PlanPoint {
  const s = sagittaMm(radiusMm, widthMm);
  return [widthMm / 2, convex ? zFront + s - radiusMm : zFront - s + radiusMm];
}

/**
 * ДУГА ФАСАДА МЕЖДУ ДВУМЯ X — окружность центра `c` и радиуса `r`, верхняя
 * (выпуклая) или нижняя (вогнутая) половина. Обход слева направо.
 */
export function frontArcBetween(c: PlanPoint, r: number, convex: boolean, xa: number, xb: number): PathSeg[] {
  const angleAt = (x: number) => {
    const cos = Math.max(-1, Math.min(1, (x - c[0]) / r));
    const a = Math.acos(cos);
    return convex ? a : -a;
  };
  return arc(c, r, angleAt(xa), angleAt(xb));
}

/** Где дуга фасада проходит над точкой x. */
export function frontArcZ(c: PlanPoint, r: number, convex: boolean, x: number): number {
  const dx = x - c[0];
  const dz = Math.sqrt(Math.max(0, r * r - dx * dx));
  return convex ? c[1] + dz : c[1] - dz;
}

/**
 * КОНТУР С ФАСАДОМ ДУГОЙ: дуга `c, r` от `xa` до `xb`, правая сторона к
 * стене, задняя, левая от стены. Тот же обход, что у скруглённого
 * прямоугольника.
 */
export function arcFrontPath(xa: number, xb: number, zBack: number, c: PlanPoint, r: number, convex: boolean): PlanPath {
  const za = frontArcZ(c, r, convex, xa);
  const zb = frontArcZ(c, r, convex, xb);
  return [
    ...frontArcBetween(c, r, convex, xa, xb),
    ...line([xb, zb], [xb, zBack]),
    ...line([xb, zBack], [xa, zBack]),
    ...line([xa, zBack], [xa, za]),
  ];
}

/* ─────────────────────────  Форма модуля  ───────────────────────── */

/** Наименьший радиус, который ещё называется радиусом модуля: меньше — это скругление кромки. */
export const RADIUS_MIN_MM = 100;

/** Габарит модуля для формы: ширина и глубина корпуса, мм. */
export type ModuleSize = { widthMm: number; depthMm: number };

/**
 * КОНТУР МОДУЛЯ В ПЛАНЕ — ОДНА ФУНКЦИЯ НА СЦЕНУ, ЛИСТ И СТОЛЕШНИЦУ.
 *
 * Без радиуса — прямоугольник `0…W × −D…0`. Торец — четверть окружности на
 * переднем углу своей стороны (у острова `back` — и на заднем). Фасад дугой —
 * дуга через передние углы корпуса (`frontArcCenter`).
 */
export function moduleOutline(unit: Pick<Module, 'radius'>, size: ModuleSize): PlanPath {
  const { widthMm: W, depthMm: D } = size;
  const spec = unit.radius;
  if (!spec) return roundedRectPath(0, W, -D, 0, {});
  if (spec.place === 'front') {
    const convex = spec.direction !== 'concave';
    return arcFrontPath(0, W, -D, frontArcCenter(W, spec.radiusMm, convex), spec.radiusMm, convex);
  }
  const R = spec.radiusMm;
  const back = spec.back ? R : 0;
  return spec.place === 'right'
    ? roundedRectPath(0, W, -D, 0, { fr: R, br: back })
    : roundedRectPath(0, W, -D, 0, { fl: R, bl: back });
}

/**
 * ЦОКОЛЬ ПОД РАДИУСНЫМ МОДУЛЕМ — КОНТУР В ПЛАНЕ (мм модуля): контур модуля,
 * отступивший от фасада и от дуги на `BENT_PLINTH.setbackMm` (как прямой
 * цоколь — на `PLINTH_SETBACK_MM`), дуги — тех же центров, что у корпуса, и
 * гнутая планка цоколя в раскрое (`radiusParts`) идёт по той же дуге. Торец —
 * отступив и сбоку: цоколь не выходит за дугу корпуса. Дуга фасада, у которой
 * цоколь не помещается между углами модуля, — `null`: прямой цоколь.
 */
export function plinthOutline(unit: Pick<Module, 'radius'>, size: ModuleSize): PlanPath | null {
  const spec = unit.radius;
  if (!spec) return null;
  const s = BENT_PLINTH.setbackMm;
  const { widthMm: W, depthMm: D } = size;
  if (spec.place === 'front') {
    const convex = spec.direction !== 'concave';
    const r = convex ? spec.radiusMm - s : spec.radiusMm + s;
    if (r <= W / 2 + 1) return null;
    return arcFrontPath(0, W, -D, frontArcCenter(W, spec.radiusMm, convex), r, convex);
  }
  const r = spec.radiusMm - s;
  if (r <= EPS) return null;
  const right = roundedRectPath(0, W - s, spec.back ? -D + s : -D, -s, { fr: r, br: spec.back ? r : 0 });
  return spec.place === 'right' ? right : mirrorPath(right, W);
}

/** Модуль с дугой — та же проверка во всех местах, где форма что-то меняет. */
export function hasRadius(unit: Pick<Module, 'radius'>): unit is { radius: RadiusSpec } {
  return Boolean(unit.radius);
}

/**
 * ФОРМА В ОТПЕЧАТКЕ: торец по дуге и фасад дугой — другая мебель, другой
 * раскрой и другие деньги. Пусто — пустая строка: у модулей без радиуса
 * отпечаток прежний до символа (ловушка 246).
 */
export function radiusKey(unit: Pick<Module, 'radius'>): string {
  const spec = unit.radius;
  if (!spec) return '';
  return [
    `r=${spec.place}`,
    spec.radiusMm,
    ...(spec.place === 'front' ? [spec.direction === 'concave' ? 'concave' : 'convex'] : []),
    ...(spec.back ? ['back'] : []),
    spec.cover,
  ].join(':');
}

/* ─────────────────────────  Проверка формы  ───────────────────────── */

/** Основы фасада, которые гнут (`frontConflict`): МДФ под эмаль и плёнку, шпон. */
const BENDABLE_FRONTS = ['mdf_film', 'mdf_enamel', 'veneer_solid'] as const;

/** Выпуклая дуга фасада дальше этого — уже не фасад шкафа, а отдельное изделие. */
export const ARC_BULGE_MAX_MM = 400;
/** Вогнутая дуга: в середине у корпуса должно остаться хотя бы столько. */
export const ARC_DEPTH_MIN_MM = 250;
/** Дверца по дуге длиннее этого — створок становится две. */
export const BENT_LEAF_MAX_MM = 600;
/** Две гнутые створки — предел: дуга длиннее — модуль делят. */
export const BENT_ARC_MAX_MM = 2 * BENT_LEAF_MAX_MM;

/**
 * МОЖНО ЛИ ТАК — И ПОЧЕМУ НЕТ, СЛОВАМИ.
 *
 * Возвращает объяснение или `null`. Объяснение называет причину мира, а не
 * запрет: «полукруглую дверцу на 180° не гнут» замерщик перескажет клиенту.
 * Проверка — до записи, тем же правилом, что потом строит детали: модуль,
 * прошедший здесь, обязан собраться в `radiusParts`.
 */
export function radiusRefusal(
  unit: Pick<Module, 'kind' | 'appliance' | 'column' | 'vitrine' | 'overhead' | 'fill' | 'front'>,
  spec: RadiusSpec,
  size: ModuleSize,
  bend?: { minRadiusMm: number | null },
): string | null {
  const { widthMm: W, depthMm: D } = size;
  const R = spec.radiusMm;
  if (!Number.isFinite(R) || Math.round(R) !== R) return 'Радиус — целое число миллиметров.';
  if (unit.kind !== 'base' && unit.kind !== 'upper' && unit.kind !== 'tall') {
    return 'Радиус бывает у напольного, навесного шкафа и пенала: угловой модуль и доборная планка по дуге не делаются.';
  }
  if (unit.appliance || unit.column) return 'В модуле стоит техника: прибор прямоугольный, и ниша под него по дуге не встанет.';
  if (unit.vitrine) return 'Витрина собирается из стекла и профиля по прямой: по дуге её корпус не встанет.';
  if (unit.overhead) return 'Корпус над шкафом стоит на крыше своего шкафа: по дуге он разошёлся бы со шкафом под ним.';
  if (unit.fill?.bays && unit.fill.bays.length > 0) return 'Модуль разделён на отсеки: перегородки отсеков по дуге не режутся — снимите отсеки.';
  if ((unit.fill?.drawerHeights.length ?? 0) > 0) {
    return 'В модуле ящики: фронт ящика плоский и по дуге не выдвигается — оставьте ящики в прямом модуле рядом.';
  }
  if (R < RADIUS_MIN_MM) return `Радиус ${R} мм — это скругление кромки, а не радиус модуля: от ${RADIUS_MIN_MM} мм.`;

  if (spec.place === 'front') {
    if (spec.back) return 'Задний угол скругляют только у торца острова, а не у фасада дугой.';
    if (spec.cover === 'slats') return 'Рейки ставят на скруглённый торец: на фасад дугой — гнутая дверца или открытые полки.';
    if (R * 2 <= W) {
      return `Дуга радиуса ${R} мм не проходит через углы модуля шириной ${W} мм: радиус должен быть больше половины ширины — от ${Math.floor(W / 2) + 1} мм.`;
    }
    const s = sagittaMm(R, W);
    if (spec.direction === 'concave') {
      if (D - s < ARC_DEPTH_MIN_MM) {
        return `Вогнутая дуга радиуса ${R} мм уходит в корпус на ${Math.round(s)} мм: в середине останется ${Math.round(D - s)} мм — меньше ${ARC_DEPTH_MIN_MM}, полка туда не встанет.`;
      }
    } else if (s > ARC_BULGE_MAX_MM) {
      return `Выпуклая дуга радиуса ${R} мм выходит вперёд на ${Math.round(s)} мм — больше ${ARC_BULGE_MAX_MM}: это уже не фасад шкафа. Возьмите радиус больше.`;
    }
    const arcMm = R * 2 * Math.asin(Math.min(1, W / 2 / R));
    if (spec.cover === 'door' && arcMm > BENT_ARC_MAX_MM) {
      return `Дуга фасада ${Math.round(arcMm)} мм: гнутых створок больше двух по ${BENT_LEAF_MAX_MM} мм не делают — разделите модуль.`;
    }
  } else {
    const limit = spec.back ? Math.floor(D / 2) : D;
    if (R > W) return `Радиус ${R} мм больше ширины модуля ${W} мм: дуга торца в нём не помещается.`;
    if (R > limit) {
      return spec.back
        ? `У торца острова скруглены оба угла: радиус не больше половины глубины — ${limit} мм.`
        : `Радиус ${R} мм больше глубины модуля ${D} мм: дуга торца в нём не помещается.`;
    }
    if (spec.cover === 'door' && spec.back) {
      return 'Полукруглую дверцу на 180° не гнут и не навешивают: торец острова — открытые полки или рейки.';
    }
    if ((spec.cover === 'door' || spec.cover === 'slats') && R !== W) {
      return `${spec.cover === 'door' ? 'Гнутая дверца закрывает' : 'Рейки закрывают'} дугу торца целиком: ширина модуля должна быть равна радиусу (${R} мм), сейчас ${W} мм — или оставьте открытые полки.`;
    }
  }

  if (spec.cover === 'door') {
    const base = unit.front?.base ?? 'ldsp';
    if (!(BENDABLE_FRONTS as readonly string[]).includes(base)) {
      return 'Гнутую дверцу делают из МДФ (эмаль или плёнка) или шпона: ЛДСП и акрил не гнутся — выберите материал фасада модуля.';
    }
  }
  if (bend?.minRadiusMm && (spec.cover === 'door' || spec.cover === 'slats') && R < bend.minRadiusMm) {
    return `Радиус ${R} мм меньше наименьшего радиуса гибки цеха — ${bend.minRadiusMm} мм.`;
  }
  return null;
}

/**
 * ПОДПИСЬ РАДИУСНОГО МОДУЛЯ — с точным радиусом: «Торец R400 · дверца»,
 * «Торец острова R300 · рейки», «Дуга R1200 · дверцы», «Вогнутая дуга R1500
 * · полки». Её читают чертёж, деталировка и слова отказов.
 */
export function radiusLabel(spec: RadiusSpec, doors: number): string {
  const cover = spec.cover === 'door' ? (doors >= 2 ? 'дверцы' : 'дверца') : spec.cover === 'open' ? 'полки' : 'рейки';
  const shape =
    spec.place === 'front' ? (spec.direction === 'concave' ? 'Вогнутая дуга' : 'Дуга') : spec.back ? 'Торец острова' : 'Торец';
  return `${shape} R${spec.radiusMm} · ${cover}`;
}

/**
 * РАДИУС ПО УМОЛЧАНИЮ — чтобы кнопка «Скруглить» сразу давала модуль, который
 * собирается: торец — R = min(W, D), у острова — половина глубины; фасад
 * дугой — R = W (стрелка — 13 % ширины).
 */
export function defaultRadiusMm(place: RadiusSpec['place'], size: ModuleSize, back = false): number {
  if (place === 'front') return Math.max(size.widthMm, RADIUS_MIN_MM);
  return Math.max(RADIUS_MIN_MM, Math.min(size.widthMm, back ? Math.floor(size.depthMm / 2) : size.depthMm));
}

/* ─────────────────────────  Детали  ───────────────────────── */

/**
 * ФОРМА ДЕТАЛИ:
 *   box    прямая деталь — коробка (центр и размер, мм; `yaw` — поворот
 *          вокруг вертикали у рейки на дуге, как `rotation.y` сцены);
 *   plate  горизонтальная деталь по контуру: `path` в плане, `y0…y1`;
 *   shell  гнутая вертикальная деталь: кольцевой сектор центра `c`, радиусов
 *          `r0 < r1`, от угла `from` к углу `to`, высотой `y0…y1`.
 */
export type RadiusForm =
  | { kind: 'box'; center: [number, number, number]; size: [number, number, number]; yaw?: number }
  | { kind: 'plate'; path: PlanPath; y0: number; y1: number }
  | { kind: 'shell'; c: PlanPoint; r0: number; r1: number; from: number; to: number; y0: number; y1: number };

/** Вид детали — имя раскроя по нему ставит одна таблица (`RADIUS_PART_NAME` в panels.ts). */
export type RadiusPartKind = 'side' | 'bottom' | 'top' | 'back' | 'shelf' | 'door' | 'plinth' | 'substrate' | 'slat';

export type RadiusPart = {
  /** Ключ детали в модуле: `side:joint`, `shelf:2`, `door:0`, `slat:7`. */
  key: string;
  kind: RadiusPartKind;
  form: RadiusForm;
  /** Как делают: с форматки, контур на ЧПУ, гнутая. */
  process: 'flat' | 'cnc' | 'bend';
  /** Створка: деталь сцены `door:i` и сторона петель. */
  leaf?: string;
  hinge?: 'left' | 'right';
  /** Деталь внутри корпуса: за закрытой дверцей её не видно. */
  inside?: boolean;
};

/** Числа модуля, из которых строятся детали: школа цеха и наполнение. */
export type RadiusDims = ModuleSize & {
  heightMm: number;
  carcassMm: number;
  frontMm: number;
  gapMm: number;
  backMm: number;
  /** Высота цоколя под модулем; `null` — модуль висит (цоколя нет). */
  plinthMm: number | null;
  /** Полки — высоты низа полки от низа корпуса (`fill.shelves`, система 32). */
  shelvesMm: number[];
  /** Полка мельче корпуса на этот припуск (`allowances.shelfDepthMm`). */
  shelfSetbackMm: number;
  /** Сторона петель одной гнутой створки фасада дугой (`openingOf`). */
  hinge: 'left' | 'right';
};

/**
 * РЕЙКИ И ПОДЛОЖКА — ЧИСЛА РИСУНКА: ширина рейки, зазор и толщина гнутой
 * подложки — то, как декор выглядит; детали из листа раскрой считает из них
 * же. Толщина рейки — толщина фасада цеха: рейку режут из того же листа, что
 * фасад, и своего листа под неё нет. Способ гибки подложки — цеха (DEMO ONLY
 * до подтверждения).
 */
export const SLATS = { widthMm: 30, gapMm: 15, substrateMm: 6 } as const;
/** Цоколь по дуге: толщина гнутой планки и её отступ от фасада (как `PLINTH_SETBACK_MM`). */
export const BENT_PLINTH = { thicknessMm: 16, setbackMm: 50 } as const;

/** Угол точки на окружности центра `c`. */
function angleOf(c: PlanPoint, p: PlanPoint): number {
  return Math.atan2(p[1] - c[1], p[0] - c[0]);
}

/**
 * ГНУТЫЕ СТВОРКИ МОДУЛЯ — СКОЛЬКО, НА КАКОЙ СТОРОНЕ ПЕТЛИ И ГДЕ ОСЬ.
 *
 * Одна функция на детали (`radiusParts`), сцену (`sceneLeaves`) и смету: число
 * створок не выводится в двух местах. Торец — одна дверца, петли у фасадного
 * конца дуги (на боковине стыка); фасад дугой — две створки, если дуга длиннее
 * `BENT_LEAF_MAX_MM` (петли у краёв модуля), иначе одна — на стороне
 * `singleHinge` (`openingOf`). Ось — на передней плоскости корпуса, у конца
 * дуги корпуса: там же, где у плоской створки.
 */
export function bentLeavesOf(
  unit: Pick<Module, 'radius' | 'widthMm'>,
  singleHinge: 'left' | 'right' = 'left',
): { leaf: string; hinge: 'left' | 'right'; pivotMm: PlanPoint }[] {
  const spec = unit.radius;
  if (!spec || spec.cover !== 'door') return [];
  const W = unit.widthMm;
  const R = spec.radiusMm;
  if (spec.place === 'right') return [{ leaf: 'door:0', hinge: 'left', pivotMm: [W - R, 0] }];
  if (spec.place === 'left') return [{ leaf: 'door:0', hinge: 'right', pivotMm: [R, 0] }];
  const arcMm = R * 2 * Math.asin(Math.min(1, W / 2 / R));
  if (arcMm > BENT_LEAF_MAX_MM) {
    return [
      { leaf: 'door:0', hinge: 'left', pivotMm: [0, 0] },
      { leaf: 'door:1', hinge: 'right', pivotMm: [W, 0] },
    ];
  }
  return [{ leaf: 'door:0', hinge: singleHinge, pivotMm: singleHinge === 'left' ? [0, 0] : [W, 0] }];
}

/** Дуга торца: центр и обход от фасадного конца к концу у боковины (или сзади у острова). */
type EndArc = { c: PlanPoint; from: number; to: number };

/**
 * ДУГИ ТОРЦА — ОДНА ФУНКЦИЯ НА ДВЕРЦУ, ПОДЛОЖКУ, РЕЙКИ И ЦОКОЛЬ.
 *
 * Справа: центр (W − R, −R), от 90° (фасад) к 0° (боковина); у острова ещё
 * задний угол — центр (W − R, −D + R), от 0° к −90°. Слева — зеркально: от
 * 90° к 180°, затем к 270°. При D = 2R центры совпадают, и дуга одна —
 * полукруг.
 */
export function endArcs(spec: RadiusSpec, size: ModuleSize): EndArc[] {
  const { widthMm: W, depthMm: D } = size;
  const R = spec.radiusMm;
  const right = spec.place === 'right';
  const H = Math.PI / 2;
  const cf: PlanPoint = right ? [W - R, -R] : [R, -R];
  const front: EndArc = right ? { c: cf, from: H, to: 0 } : { c: cf, from: H, to: Math.PI };
  if (!spec.back) return [front];
  const cb: PlanPoint = right ? [W - R, -D + R] : [R, -D + R];
  const back: EndArc = right ? { c: cb, from: 0, to: -H } : { c: cb, from: Math.PI, to: 3 * H };
  if (Math.hypot(cf[0] - cb[0], cf[1] - cb[1]) < EPS) return [{ c: cf, from: front.from, to: back.to }];
  return [front, back];
}

/** Дуга, ужатая с обоих концов на угол `delta` (зазор фасада по дуге). */
function insetArc(a: EndArc, delta: number): EndArc {
  const dir = Math.sign(a.to - a.from);
  return { c: a.c, from: a.from + dir * delta, to: a.to - dir * delta };
}

/**
 * ДЕТАЛИ РАДИУСНОГО МОДУЛЯ — ОДНА ФУНКЦИЯ НА СЦЕНУ И РАСКРОЙ.
 *
 * Схема сборки радиусного корпуса: дно и крыша по контуру (ЧПУ), боковины
 * между ними, задняя стенка на всю высоту сзади. Это способ, названный
 * продуктом, а не подтверждённый цехом: пока цех не поставил галочку, модуль
 * DEMO ONLY (`radiusMethodState`).
 */
export function radiusParts(unit: Pick<Module, 'radius'>, dims: RadiusDims): RadiusPart[] {
  const spec = unit.radius;
  if (!spec) return [];
  const { widthMm: W, depthMm: D, heightMm: H, carcassMm: t, frontMm: tf, gapMm: g, backMm: tb } = dims;
  /* Левый торец строится справа и отражается в конце — контур дна и крыши тоже правый. */
  const outline = moduleOutline(spec.place === 'left' ? { radius: { ...spec, place: 'right' } } : unit, dims);
  const parts: RadiusPart[] = [];
  const box = (key: string, kind: RadiusPartKind, x: [number, number], y: [number, number], z: [number, number]) => {
    if (x[1] - x[0] <= EPS || y[1] - y[0] <= EPS || z[1] - z[0] <= EPS) return;
    parts.push({
      key,
      kind,
      process: 'flat',
      form: {
        kind: 'box',
        center: [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2],
        size: [x[1] - x[0], y[1] - y[0], z[1] - z[0]],
      },
    });
  };
  const shell = (part: Omit<RadiusPart, 'form'>, arcPiece: EndArc, r0: number, r1: number, y0: number, y1: number) =>
    parts.push({ ...part, form: { kind: 'shell', c: arcPiece.c, r0, r1, from: arcPiece.from, to: arcPiece.to, y0, y1 } });

  /* Дно и крыша — по контуру модуля, ЧПУ. */
  parts.push({ key: 'bottom', kind: 'bottom', process: 'cnc', form: { kind: 'plate', path: outline, y0: 0, y1: t } });
  parts.push({ key: 'top', kind: 'top', process: 'cnc', form: { kind: 'plate', path: outline, y0: H - t, y1: H } });

  /* Полка — тот же контур, отступивший внутрь на припуск (центры дуг те же). */
  const s = Math.max(dims.shelfSetbackMm, t + 1);
  const shelvesOn = (path: PlanPath) =>
    dims.shelvesMm.forEach((y, i) => {
      if (y <= t || y + t >= H - t) return;
      parts.push({
        key: `shelf:${i}`,
        kind: 'shelf',
        process: 'cnc',
        ...(spec.cover !== 'open' ? { inside: true } : {}),
        form: { kind: 'plate', path, y0: y, y1: y + t },
      });
    });

  if (spec.place === 'front') {
    const convex = spec.direction !== 'concave';
    const R = spec.radiusMm;
    const c = frontArcCenter(W, R, convex);
    /* Боковины — на всю глубину у передних углов; задняя стенка — во всю ширину. */
    box('side:left', 'side', [0, t], [t, H - t], [-D, 0]);
    box('side:right', 'side', [W - t, W], [t, H - t], [-D, 0]);
    box('back', 'back', [0, W], [0, H], [-D, -D + tb]);
    shelvesOn(arcFrontPath(t + 1, W - t - 1, -D + tb, c, convex ? R - s : R + s, convex));

    /* Сколько створок и где петли — `bentLeavesOf`, та же функция, что у сцены. */
    const leaves = bentLeavesOf({ radius: spec, widthMm: W }, dims.hinge);
    if (spec.cover === 'door' && leaves.length > 0) {
      const n = leaves.length;
      /* Выпуклая: дверца снаружи дуги корпуса; вогнутая — перед ней, к центру. */
      const [r0, r1] = convex ? [R, R + tf] : [R - tf, R];
      /*
       * КОНЦЫ СТВОРОК — ПО НАРУЖНОЙ ГРАНИ, как у плоской створки: от g/2 до
       * W − g/2, между створками — зазор g. По внутренней грани наружная
       * выходила за край модуля на 3,4 мм — в створку соседа.
       */
      const outer = (x: number) => {
        const a = Math.acos(Math.max(-1, Math.min(1, (x - c[0]) / r1)));
        return convex ? a : -a;
      };
      const edges = n === 2 ? [[g / 2, W / 2 - g / 2], [W / 2 + g / 2, W - g / 2]] : [[g / 2, W - g / 2]];
      for (let i = 0; i < n; i += 1) {
        const piece = { c, from: outer(edges[i][0]), to: outer(edges[i][1]) };
        shell(
          { key: `door:${i}`, kind: 'door', process: 'bend', leaf: leaves[i].leaf, hinge: leaves[i].hinge },
          piece,
          r0,
          r1,
          g / 2,
          H - g / 2,
        );
      }
    }
    if (dims.plinthMm !== null) {
      /* Цоколь по дуге — отступив от фасада корпуса, тем же центром, от боковины до боковины. */
      const rp = convex ? R - BENT_PLINTH.setbackMm : R + BENT_PLINTH.setbackMm;
      if (rp > W / 2 + 1) {
        const z0 = frontArcZ(c, rp, convex, 0);
        const z1 = frontArcZ(c, rp, convex, W);
        const [p0, p1] = convex ? [rp - BENT_PLINTH.thicknessMm, rp] : [rp, rp + BENT_PLINTH.thicknessMm];
        shell({ key: 'plinth:0', kind: 'plinth', process: 'bend' }, { c, from: angleOf(c, [0, z0]), to: angleOf(c, [W, z1]) }, p0, p1, -dims.plinthMm, 0);
      }
    }
    return parts;
  }

  /*
   * ── Скруглённый торец; у острова — оба угла стороны. ──
   *
   * Детали строятся для торца СПРАВА, а левый — их зеркало (`mirrorForm`):
   * две формулы одной формы разошлись бы на первой правке.
   */
  const R = spec.radiusMm;
  const backR = spec.back ? R : 0;
  const rightSpec: RadiusSpec = { ...spec, place: 'right' };
  /* Боковина у стыка с соседом — на всю глубину; у торца — прямой остаток между дугами. */
  box('side:joint', 'side', [0, t], [t, H - t], [-D, 0]);
  box('side:end', 'side', [W - t, W], [t, H - t], [-D + backR, -R]);
  box('back', 'back', [0, W - backR], [0, H], [-D, -D + tb]);
  if (R - s > EPS && W - s > t + 1) {
    shelvesOn(endShelfPath(W, D, R, s, t + 1, spec.back ? -D + s : -D + tb, Boolean(spec.back)));
  }

  const arcs = endArcs(rightSpec, dims);
  if (spec.cover === 'door') {
    /* Одна дверца на дугу торца: петли — у фасадного конца дуги, на боковине стыка. */
    shell({ key: 'door:0', kind: 'door', process: 'bend', leaf: 'door:0', hinge: 'left' }, insetArc(arcs[0], g / 2 / R), R, R + tf, g / 2, H - g / 2);
  }
  if (spec.cover === 'slats') {
    arcs.forEach((piece, i) =>
      shell({ key: `substrate:${i}`, kind: 'substrate', process: 'bend' }, piece, R, R + SLATS.substrateMm, 0, H),
    );
    /* Рейки — поровну по дуге, касательно к ней: шаг — ширина рейки плюс зазор. */
    const rc = R + SLATS.substrateMm + tf / 2;
    let index = 0;
    for (const piece of arcs) {
      const sweep = piece.to - piece.from;
      const n = Math.max(1, Math.floor((rc * Math.abs(sweep) + SLATS.gapMm) / (SLATS.widthMm + SLATS.gapMm)));
      for (let k = 0; k < n; k += 1) {
        const a = piece.from + (sweep * (k + 0.5)) / n;
        parts.push({
          key: `slat:${index}`,
          kind: 'slat',
          process: 'flat',
          form: {
            kind: 'box',
            center: [piece.c[0] + rc * Math.cos(a), H / 2, piece.c[1] + rc * Math.sin(a)],
            size: [SLATS.widthMm, H, tf],
            yaw: -a - Math.PI / 2,
          },
        });
        index += 1;
      }
    }
  }
  if (dims.plinthMm !== null && R - BENT_PLINTH.setbackMm > BENT_PLINTH.thicknessMm) {
    const r1 = R - BENT_PLINTH.setbackMm;
    arcs.forEach((piece, i) =>
      shell({ key: `plinth:${i}`, kind: 'plinth', process: 'bend' }, piece, r1 - BENT_PLINTH.thicknessMm, r1, -dims.plinthMm!, 0),
    );
  }
  if (spec.place !== 'left') return parts;
  /* Левый торец — зеркало правого; петли дверцы — на другой стороне. */
  return parts.map((part) => ({
    ...part,
    form: mirrorForm(part.form, W),
    ...(part.hinge ? { hinge: part.hinge === 'left' ? ('right' as const) : ('left' as const) } : {}),
  }));
}

/** Зеркало детали по ширине модуля: коробка, контур и гнутая деталь. */
function mirrorForm(form: RadiusForm, W: number): RadiusForm {
  if (form.kind === 'box') {
    return { ...form, center: [W - form.center[0], form.center[1], form.center[2]], ...(form.yaw !== undefined ? { yaw: -form.yaw } : {}) };
  }
  if (form.kind === 'plate') return { ...form, path: mirrorPath(form.path, W) };
  return { ...form, c: [W - form.c[0], form.c[1]], from: Math.PI - form.from, to: Math.PI - form.to };
}

/**
 * ПОЛКА СКРУГЛЁННОГО ТОРЦА (справа): контур модуля, отступивший внутрь на
 * припуск `s`, обрезанный по внутренней плоскости боковины стыка `xl`.
 *
 * При ширине, равной радиусу, боковина пересекает дугу полки: полка
 * начинается на дуге, а не на фасаде, — прямоугольник со скруглением здесь
 * дал бы полку сквозь боковину (так и было в первой версии: x от 0).
 */
function endShelfPath(W: number, D: number, R: number, s: number, xl: number, zBack: number, back: boolean): PlanPath {
  const rs = R - s;
  const xr = W - s;
  const cf: PlanPoint = [W - R, -R];
  const segs: PathSeg[] = [];
  let first: PlanPoint;
  if (xl <= cf[0]) {
    first = [xl, -s];
    segs.push(...line(first, [cf[0], -s]), ...arc(cf, rs, Math.PI / 2, 0));
  } else {
    const a0 = Math.acos(Math.min(1, (xl - cf[0]) / rs));
    first = [xl, cf[1] + rs * Math.sin(a0)];
    segs.push(...arc(cf, rs, a0, 0));
  }
  if (back) {
    const cb: PlanPoint = [W - R, -D + R];
    segs.push(...line([xr, cf[1]], [xr, cb[1]]));
    if (xl <= cb[0]) {
      segs.push(...arc(cb, rs, 0, -Math.PI / 2), ...line([cb[0], -D + s], [xl, -D + s]), ...line([xl, -D + s], first));
    } else {
      const a1 = -Math.acos(Math.min(1, (xl - cb[0]) / rs));
      const last: PlanPoint = [xl, cb[1] + rs * Math.sin(a1)];
      segs.push(...arc(cb, rs, 0, a1), ...line(last, first));
    }
  } else {
    segs.push(...line([xr, cf[1]], [xr, zBack]), ...line([xr, zBack], [xl, zBack]), ...line([xl, zBack], first));
  }
  return segs;
}

/* ─────────────────────────  Габарит детали  ───────────────────────── */

export type PartBounds = { min: [number, number, number]; max: [number, number, number] };

/** Габарит детали в координатах модуля, мм: по нему сцена ставит коробку, а проверки меряют входы. */
export function partBounds(form: RadiusForm): PartBounds {
  if (form.kind === 'box') {
    const [cx, cy, cz] = form.center;
    const [sx, sy, sz] = form.size;
    const cos = Math.abs(Math.cos(form.yaw ?? 0));
    const sin = Math.abs(Math.sin(form.yaw ?? 0));
    const hx = (sx * cos + sz * sin) / 2;
    const hz = (sx * sin + sz * cos) / 2;
    return { min: [cx - hx, cy - sy / 2, cz - hz], max: [cx + hx, cy + sy / 2, cz + hz] };
  }
  if (form.kind === 'plate') {
    const b = pathBounds(form.path);
    return { min: [b.minX, form.y0, b.minZ], max: [b.maxX, form.y1, b.maxZ] };
  }
  const b = pathBounds(shellPath(form));
  return { min: [b.minX, form.y0, b.minZ], max: [b.maxX, form.y1, b.maxZ] };
}

/**
 * ДЕТАЛЬ ПРИЗМОЙ: контур в плане и высота — одна форма на сетку сцены, её
 * рёбра и чертёж. Коробка с поворотом (рейка на дуге) — прямоугольник,
 * повёрнутый так же, как `rotation.y` сцены; контур — как есть; гнутая —
 * кольцевой сектор (`shellPath`).
 */
export function formPrism(form: RadiusForm): { path: PlanPath; y0: number; y1: number } {
  if (form.kind === 'plate') return { path: form.path, y0: form.y0, y1: form.y1 };
  if (form.kind === 'shell') return { path: shellPath(form), y0: form.y0, y1: form.y1 };
  const [cx, cy, cz] = form.center;
  const [sx, sy, sz] = form.size;
  const cos = Math.cos(form.yaw ?? 0);
  const sin = Math.sin(form.yaw ?? 0);
  const at = (lx: number, lz: number): PlanPoint => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
  const corners = [at(-sx / 2, sz / 2), at(sx / 2, sz / 2), at(sx / 2, -sz / 2), at(-sx / 2, -sz / 2)];
  return {
    path: corners.map((a, i) => ({ kind: 'line' as const, a, b: corners[(i + 1) % 4] })),
    y0: cy - sy / 2,
    y1: cy + sy / 2,
  };
}

/**
 * РЁБРА ДЕТАЛИ — по её контуру, а не по габариту (мм модуля): контур снизу и
 * сверху и вертикали только на изломах контура (больше 25°). На дуге
 * вертикалей нет: гнутая деталь читается гладкой, а не гранёной.
 */
export function prismEdgesMm(form: RadiusForm): [[number, number, number], [number, number, number]][] {
  const { path, y0, y1 } = formPrism(form);
  const points = samplePath(path);
  const n = points.length;
  const out: [[number, number, number], [number, number, number]][] = [];
  if (n < 3) return out;
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % n];
    out.push([[p[0], y0, p[1]], [q[0], y0, q[1]]], [[p[0], y1, p[1]], [q[0], y1, q[1]]]);
    const prev = points[(i + n - 1) % n];
    const a = Math.atan2(p[1] - prev[1], p[0] - prev[0]);
    const b = Math.atan2(q[1] - p[1], q[0] - p[0]);
    let turn = Math.abs(b - a);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > (25 * Math.PI) / 180) out.push([[p[0], y0, p[1]], [p[0], y1, p[1]]]);
  }
  return out;
}

/** Кольцевой сектор гнутой детали — замкнутым путём: внешняя дуга туда, внутренняя обратно. */
export function shellPath(form: Extract<RadiusForm, { kind: 'shell' }>): PlanPath {
  return [
    { kind: 'arc', c: form.c, r: form.r1, from: form.from, to: form.to },
    { kind: 'line', a: [form.c[0] + form.r1 * Math.cos(form.to), form.c[1] + form.r1 * Math.sin(form.to)], b: [form.c[0] + form.r0 * Math.cos(form.to), form.c[1] + form.r0 * Math.sin(form.to)] },
    { kind: 'arc', c: form.c, r: form.r0, from: form.to, to: form.from },
    { kind: 'line', a: [form.c[0] + form.r0 * Math.cos(form.from), form.c[1] + form.r0 * Math.sin(form.from)], b: [form.c[0] + form.r1 * Math.cos(form.from), form.c[1] + form.r1 * Math.sin(form.from)] },
  ];
}

/**
 * КРОМКА ДЕТАЛИ ПО КОНТУРУ — ТОЧНОЙ ДЛИНОЙ, а не «длинных торцов × длина».
 *
 * Клеится то, что видно: дуги и фасадные прямые, и торцевая прямая у
 * скруглённого торца; не клеятся задняя кромка (у стены) и кромки у боковин
 * стыка (их закрывает боковина соседа, у фасада дугой — свои боковины). У
 * полки — только фасад и дуги: за ней задняя стенка и боковины.
 */
export function bandedEdgeMm(path: PlanPath, opts: { joint: 'left' | 'right' | 'both'; shelf: boolean }): number {
  const b = pathBounds(path);
  const on = (v: number, w: number) => Math.abs(v - w) < 0.01;
  let sum = 0;
  for (const seg of path) {
    if (seg.kind === 'arc') {
      sum += segLength(seg);
      continue;
    }
    const front = on(seg.a[1], b.maxZ) && on(seg.b[1], b.maxZ);
    const back = on(seg.a[1], b.minZ) && on(seg.b[1], b.minZ);
    const left = on(seg.a[0], b.minX) && on(seg.b[0], b.minX);
    const right = on(seg.a[0], b.maxX) && on(seg.b[0], b.maxX);
    if (back) continue;
    if (opts.shelf && !front) continue;
    if (left && (opts.joint === 'left' || opts.joint === 'both')) continue;
    if (right && (opts.joint === 'right' || opts.joint === 'both')) continue;
    sum += segLength(seg);
  }
  return sum;
}

/** Развёртка гнутой детали по средней линии, мм — длина заготовки. */
export function shellDevelopedMm(form: Extract<RadiusForm, { kind: 'shell' }>): number {
  return ((form.r0 + form.r1) / 2) * Math.abs(form.to - form.from);
}

/** Угол дуги гнутой детали, градусы. */
export function shellAngleDeg(form: Extract<RadiusForm, { kind: 'shell' }>): number {
  return (Math.abs(form.to - form.from) * 180) / Math.PI;
}
