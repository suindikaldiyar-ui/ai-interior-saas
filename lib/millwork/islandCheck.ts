/**
 * ОСТРОВ В КОМНАТЕ — ПРОХОДЫ И ПЕРЕСЕЧЕНИЯ (OVAL & RADIUS, этап A).
 *
 * Где стоит остров, решает человек (`IslandPlacement`); что из этого
 * следует — здесь, числом и словами:
 *   вошёл в мебель ряда, в стену или в колонну — блокирующее: на объекте
 *     он не встанет, цены нет, раскрой заперт; данные целы, запись идёт;
 *   проход до мебели ряда меньше `CORNER.minAisleMm` — уточнение с
 *     последствием: «не разойтись вдвоём и не открыть ящик напротив» —
 *     то же правило, что у рядов П-образной кухни.
 *
 * Меряется нарисованное в плане: следы модулей острова (полуокружность
 * торца — его контуром, прямые — корпус с фасадом и панелью тыла) и
 * модулей рядов (корпус их глубины с фасадом) в мировых мм — тем же местом
 * рядов, что у сцены (`runPlacements`, `islandPlacement`). Следы выпуклые:
 * пересечение — разделяющими осями, проход — расстояние между контурами.
 * Скруглённые торцы рядов у стены берутся габаритом — проход до них
 * меньше настоящего, а не больше.
 */
import type { Module, Run } from '@/types/millwork';
import { OPENING_KIND_TITLE } from '@/types/millwork';
import { moduleDepthMm, rowStandardDepthMm } from './fill';
import { CORNER, standsOnFloor } from './modules';
import { workTopMm, shopOf } from './shop';
import { SLATS, endArcs, moduleOutline, pathBounds, sagittaMm, samplePath, type PlanPoint } from './radius';
import { ISLAND_LABEL, islandBackOf, islandDepthMm, islandPlacement, type RowPlace } from './island';
import type { Room } from './room';
import { wallLabel } from './walls';

export type IslandIssue = { id: string; severity: 'blocking' | 'clarify'; message: string };

type Poly = PlanPoint[];

/* ─────────────────────────  Выпуклые многоугольники  ───────────────────────── */

/** Выпуклая оболочка (монотонная цепь): контур торца с рейками — одной фигурой. */
function hull(points: PlanPoint[]): Poly {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: PlanPoint, a: PlanPoint, b: PlanPoint) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: PlanPoint[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: PlanPoint[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Насколько выпуклые фигуры входят друг в друга, мм (разделяющие оси); 0 — не входят. */
function penetration(a: Poly, b: Poly): number {
  let least = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 1e-9) continue;
      const axis: PlanPoint = [-(q[1] - p[1]) / len, (q[0] - p[0]) / len];
      const range = (shape: Poly) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of shape) {
          const t = v[0] * axis[0] + v[1] * axis[1];
          lo = Math.min(lo, t);
          hi = Math.max(hi, t);
        }
        return [lo, hi] as const;
      };
      const [aLo, aHi] = range(a);
      const [bLo, bHi] = range(b);
      const overlap = Math.min(aHi, bHi) - Math.max(aLo, bLo);
      if (overlap <= 0) return 0;
      least = Math.min(least, overlap);
    }
  }
  return Number.isFinite(least) ? least : 0;
}

function pointSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/** Расстояние между непересекающимися выпуклыми фигурами, мм: вершина — до стороны. */
function distance(a: Poly, b: Poly): number {
  let best = Infinity;
  for (const [from, to] of [[a, b], [b, a]] as const) {
    for (const p of from) {
      for (let i = 0; i < to.length; i += 1) best = Math.min(best, pointSegment(p, to[i], to[(i + 1) % to.length]));
    }
  }
  return best;
}

/* ─────────────────────────  Следы мебели  ───────────────────────── */

/** Точка ряда (мм, его координаты) в мире — тем же поворотом, что у группы ряда в сцене. */
function toWorld(place: RowPlace, p: PlanPoint): PlanPoint {
  const a = (place.rotationYDeg * Math.PI) / 180;
  return [place.xM * 1000 + p[0] * Math.cos(a) + p[1] * Math.sin(a), place.zM * 1000 - p[0] * Math.sin(a) + p[1] * Math.cos(a)];
}

function rect(x0: number, x1: number, z0: number, z1: number): Poly {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

/** Есть ли у модуля фасад впереди корпуса — дверцы, ящики или гнутая дверца. */
function frontMm(unit: Module, tf: number): number {
  const front = unit.radius ? unit.radius.cover === 'door' : unit.frontType !== 'none';
  return front ? tf : 0;
}

/**
 * СЛЕД МОДУЛЯ ОСТРОВА — мм острова. Скруглённый торец — его контуром (и
 * рейками поверх дуги); прямой — корпус с фасадом спереди и панелью тыла
 * сзади; фасад дугой — со стрелкой дуги.
 */
function islandFootprint(unit: Module, run: Run): Poly {
  const tf = shopOf(run.production).frontMm;
  const D = islandDepthMm(run);
  const o = unit.offsetMm;
  const spec = unit.radius;
  if (spec?.back) {
    const size = { widthMm: unit.widthMm, depthMm: D };
    const points: PlanPoint[] = samplePath(moduleOutline(unit, size), 1).map((p) => [o + p[0], p[1]]);
    if (spec.cover === 'slats') {
      const r = spec.radiusMm + SLATS.substrateMm + tf;
      for (const piece of endArcs(spec, size)) {
        for (let k = 0; k <= 16; k += 1) {
          const angle = piece.from + ((piece.to - piece.from) * k) / 16;
          points.push([o + piece.c[0] + r * Math.cos(angle), piece.c[1] + r * Math.sin(angle)]);
        }
      }
    }
    return hull(points);
  }
  const bulge = spec?.place === 'front' && spec.direction !== 'concave' ? sagittaMm(spec.radiusMm, unit.widthMm) : 0;
  const back = islandBackOf(unit, run) ? tf : 0;
  return rect(o, o + unit.widthMm, -D - back, frontMm(unit, tf) + (Number.isFinite(bulge) ? bulge : 0));
}

/** След модуля ряда у стены — мм ряда: тыл на стене, перёд — его глубина и фасад. */
function rowFootprint(unit: Module, run: Run): Poly {
  const tf = shopOf(run.production).frontMm;
  const D = rowStandardDepthMm(run.zone, 'base', run.production);
  const d = moduleDepthMm(unit, run.zone, run.production);
  if (unit.radius) {
    const b = pathBounds(moduleOutline(unit, { widthMm: unit.widthMm, depthMm: d }));
    return rect(unit.offsetMm + b.minX, unit.offsetMm + b.maxX, -D, -D + d + b.maxZ + frontMm(unit, tf));
  }
  return rect(unit.offsetMm, unit.offsetMm + unit.widthMm, -D, -D + d + frontMm(unit, tf));
}

/* ─────────────────────────  Проверка  ───────────────────────── */

/**
 * ЧТО СЛЕДУЕТ ИЗ МЕСТА ОСТРОВА — блокирующее и уточнения, словами.
 *
 * `rows` — ряды стен с местом в сцене (`runPlacements`), первый — стена А;
 * `room` — комната вокруг них (`roomAroundRows`), её может не быть.
 */
/** Следы модулей острова в мире, мм. */
function islandShapes(island: Run, rowA: RowPlace): Poly[] {
  const place = islandPlacement(rowA, island);
  return island.modules
    .filter((unit) => standsOnFloor(unit))
    .map((unit) => islandFootprint(unit, island).map((p) => toWorld(place, p)));
}

/** Как назвать стену комнаты: по умолчанию — стеной композиции по номеру. */
type WallName = (wall: Room['walls'][number]) => string;
const chainName: WallName = (wall) => wallLabel(wall.index);

export function islandIssues(input: {
  island: Run;
  rows: { run: Run; placement: RowPlace }[];
  room: Room | null;
  /** Имя стены комнаты: у замера 2.0 в комнате и стены без мебели. */
  nameOf?: WallName;
}): IslandIssue[] {
  const { island, rows, room } = input;
  const nameOf = input.nameOf ?? chainName;
  if (!island.island || rows.length === 0) return [];
  const shapes = islandShapes(island, rows[0].placement);
  if (shapes.length === 0) return [];
  const issues: IslandIssue[] = [];

  /* Мебель рядов: ближайший модуль каждого ряда — вошёл или проход. */
  rows.forEach((row, index) => {
    let worst: { pen: number; dist: number; unit: Module } | null = null;
    for (const unit of row.run.modules.filter((m) => standsOnFloor(m))) {
      const foot = rowFootprint(unit, row.run).map((p) => toWorld(row.placement, p));
      for (const shape of shapes) {
        const pen = penetration(shape, foot);
        const dist = pen > 0 ? 0 : distance(shape, foot);
        if (!worst || pen > worst.pen || (pen === 0 && worst.pen === 0 && dist < worst.dist)) worst = { pen, dist, unit };
      }
    }
    if (!worst) return;
    const where = `«${worst.unit.label}» (${wallLabel(index)})`;
    if (worst.pen > 0.5) {
      issues.push({
        id: `island-clash-${index}`,
        severity: 'blocking',
        message: `${ISLAND_LABEL} заходит в ${where} на ${Math.round(worst.pen)} мм: на объекте он не встанет. Сдвиньте остров или уменьшите его.`,
      });
    } else if (Math.round(worst.dist) < CORNER.minAisleMm) {
      /* Сравнивается то число, что написано: 1199,9999 мм — это проход 1200, а не «меньше 1200». */
      issues.push({
        id: `island-aisle-${index}`,
        severity: 'clarify',
        message: `Проход между островом и ${where} — ${Math.round(worst.dist)} мм, меньше ${CORNER.minAisleMm} мм: не разойтись вдвоём и не открыть ящик напротив.`,
      });
    }
  });

  if (!room) return issues;

  /* Стены композиции: остров по ту сторону их внутренней грани. */
  for (const wall of room.walls) {
    let depth = 0;
    for (const shape of shapes) {
      for (const p of shape) {
        const rel: PlanPoint = [p[0] - wall.startMm[0], p[1] - wall.startMm[1]];
        const along = rel[0] * wall.dir[0] + rel[1] * wall.dir[1];
        const into = rel[0] * wall.inward[0] + rel[1] * wall.inward[1];
        if (along >= 0 && along <= wall.lengthMm && into < 0) depth = Math.max(depth, -into);
      }
    }
    if (depth > 0.5) {
      issues.push({
        id: `island-wall-${wall.index}`,
        severity: 'blocking',
        message: `${ISLAND_LABEL} заходит за внутреннюю грань стены (${nameOf(wall)}) на ${Math.round(depth)} мм: там стена.`,
      });
    }
  }

  /* Колонна, короб и выступ у стены — по полу, если вынос замерен и низ ниже столешницы. */
  const top = workTopMm(island.production);
  for (const object of room.objects) {
    if (object.cut !== 'volume' || object.depthMm === null || object.bottomMm >= top) continue;
    const wall = room.walls.find((item) => item.index === object.wallIndex);
    if (!wall) continue;
    const at = (u: number, v: number): PlanPoint => [
      wall.startMm[0] + wall.dir[0] * u + wall.inward[0] * v,
      wall.startMm[1] + wall.dir[1] * u + wall.inward[1] * v,
    ];
    const foot: Poly = [at(object.fromMm, 0), at(object.fromMm + object.widthMm, 0), at(object.fromMm + object.widthMm, object.depthMm), at(object.fromMm, object.depthMm)];
    const pen = Math.max(0, ...shapes.map((shape) => penetration(shape, foot)));
    if (pen > 0.5) {
      issues.push({
        id: `island-object-${object.id}`,
        severity: 'blocking',
        message: `${ISLAND_LABEL} заходит в ${OPENING_KIND_TITLE[object.kind].toLowerCase()} у стены (${nameOf(wall)}) на ${Math.round(pen)} мм.`,
      });
    }
  }

  /* У одной стены комнату за краем ряда замер кухни не знает — словами. */
  if (room.walls.length === 1) {
    const wall = room.walls[0];
    let out = 0;
    for (const shape of shapes) {
      for (const p of shape) {
        const along = (p[0] - wall.startMm[0]) * wall.dir[0] + (p[1] - wall.startMm[1]) * wall.dir[1];
        out = Math.max(out, -along, along - wall.lengthMm);
      }
    }
    if (out > 0.5) {
      issues.push({
        id: 'island-beyond',
        severity: 'clarify',
        message: `${ISLAND_LABEL} выходит за край стены А на ${Math.round(out)} мм: что там, замер кухни не знает — проверьте, что остров помещается и вокруг есть проход.`,
      });
    }
  }
  return issues;
}

/**
 * ДО СТЕНЫ БЕЗ МЕБЕЛИ — ЧИСЛОМ (OVAL & RADIUS). Проход до мебели рядов
 * меряет `islandIssues` по норме прохода между рядами; до голой стены нормы в
 * продукте нет, и выдумывать её нельзя — называется расстояние. Стены без
 * мебели в комнате нет (замер кухни знает только стены под мебелью) — `null`:
 * проход за островом не проверен, и это сказано словами.
 */
export function islandWallClearance(input: {
  island: Run;
  rowA: RowPlace;
  room: Room | null;
  /** Стены под мебелью — их проход меряет `islandIssues`. */
  rowWallIds: string[];
  nameOf?: WallName;
}): { name: string; mm: number } | null {
  const { island, room } = input;
  if (!island.island || !room) return null;
  const nameOf = input.nameOf ?? chainName;
  const shapes = islandShapes(island, input.rowA);
  let best: { name: string; mm: number } | null = null;
  for (const wall of room.walls) {
    if (input.rowWallIds.includes(wall.id)) continue;
    const a: PlanPoint = [wall.startMm[0], wall.startMm[1]];
    const b: PlanPoint = [wall.startMm[0] + wall.dir[0] * wall.lengthMm, wall.startMm[1] + wall.dir[1] * wall.lengthMm];
    for (const shape of shapes) {
      /* Вершины следа до стены и концы стены до сторон следа — `distance` меряет обе. */
      const mm = distance(shape, [a, b]);
      if (!best || mm < best.mm) best = { name: nameOf(wall), mm: Math.round(mm) };
    }
  }
  return best;
}
