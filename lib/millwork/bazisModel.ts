import type { Run } from '@/types/millwork';
import { runBoxesByModule, type PartBox, type RunBoxesOptions } from './cabinetBoxes';
import { countertopSlabs, slabPieces } from './countertop';
import { boxOfPart, frameOfPart } from './drillHoles3d';
import { DRILL_ROLE_TITLE, type DrillEdge, type DrillFace, type DrillOp, type DrillPart, type DrillingPlan } from './drillingPlan';
import { counterSlabDepthMm, rowStandardDepthMm } from './fill';
import { edgeSides, type ObjectPanel } from './panels';
import { countertopMm, workTopMm } from './shop';

/**
 * МОДЕЛЬ ДЛЯ БАЗИС (слой 88) — ДЕТАЛИ ОБЪЕКТА ПО ОДНОЙ, В ОСЯХ МИРА.
 *
 * Здесь нет ни одного своего размера. Деталь и её кромка — строка деталировки (`objectPanels`), отверстия —
 * план присадки (`drillingPlan`), место и поворот — коробка сцены (`runBoxesByModule`) и место ряда (`rowPlacement`),
 * плита столешницы — `countertopSlabs`. Модель только сводит их в одну запись на деталь, которую читает скрипт
 * импорта (`bazisImportScript`): панель создаётся настоящей панелью БАЗИС, а не сеткой OBJ.
 *
 * Оси детали те же, что у присадки (`PART_AXES`): X — вдоль длины, Y — вдоль ширины. Z = X × Y; `faceAOnPlusZ`
 * говорит, с какой стороны пласть A. Контур детали в БАЗИС — четыре отрезка в этом порядке: 0 — y = 0, 1 — x = L,
 * 2 — y = W, 3 — x = 0, поэтому кромка называет отрезок, а не догадку «передняя».
 *
 * Деталь, которую сцена не рисует, места не получает и не выдумывается: `placed: false`, скрипт откладывает её
 * в блок «Детали без места» и называет в отчёте.
 */

export const BAZIS_MODEL_VERSION = 'ALDIK-BAZIS-1';

export type Vec3 = [number, number, number];

/** Как отверстия попали в модель: выпущенные, явно черновые или никак. */
export type BazisHolesMode = 'issued' | 'draft' | 'none';

export type BazisEdge = { element: 0 | 1 | 2 | 3; side: 'y0' | 'x1' | 'y1' | 'x0'; thicknessMm: number; material: string };

export type BazisHole = {
  id: string;
  role: DrillOp['role'];
  title: string;
  face?: DrillFace;
  edge?: DrillEdge;
  xMm: number;
  yMm: number;
  zMm?: number;
  diameterMm: number;
  depthMm: number;
  through: boolean;
  article: string | null;
  source: string;
};

export type BazisMaterial = {
  key: string;
  /** Как материал назван в ALDIK Studio. */
  name: string;
  /** Как он пойдёт в БАЗИС: своё имя базы цеха, если человек его сопоставил. */
  bazisName: string;
  thicknessMm: number;
  kind: string;
  decor: string | null;
  /** Сопоставлен человеком с базой материалов цеха. Нет — в БАЗИС приедет новым материалом с этим именем. */
  mapped: boolean;
};

export type BazisPanel = {
  id: string;
  number: string;
  piece: number;
  name: string;
  wall: string;
  moduleId: string;
  module: string;
  materialKey: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  grain: 'along' | 'across' | 'none';
  /** Есть место в мире. Нет — в блок «Детали без места». */
  placed: boolean;
  /** Угол детали (x = 0, y = 0) на нижней по Z пласти, мм мира. */
  origin: Vec3;
  axisX: Vec3;
  axisY: Vec3;
  axisZ: Vec3;
  min: Vec3;
  max: Vec3;
  faceAOnPlusZ: boolean;
  edges: BazisEdge[];
  holes: BazisHole[];
  /** Причины «не рассчитано» — словами плана. */
  pending: string[];
  /** Контур не прямоугольный: режется заготовкой, а дуга — по детали ALDIK. */
  shape: string | null;
  status: 'ready' | 'pending' | 'no-holes';
};

export type BazisModel = {
  format: 'aldik-bazis-model';
  version: string;
  project: string;
  title: string;
  exportedAt: string;
  fingerprint: string;
  units: 'mm';
  holesMode: BazisHolesMode;
  /** Выпуск присадки закрыт — причины словами. */
  holesWhy: string[];
  materials: BazisMaterial[];
  modules: { id: string; title: string; wall: string }[];
  panels: BazisPanel[];
  /** Плиты столешницы: своим материалом, отдельно от корпуса и фасадов. */
  counts: { panels: number; placed: number; unplaced: number; holes: number; edgeHoles: number; edges: number; materials: number };
};

export type BazisWall = {
  wallId: string;
  label: string;
  run: Run;
  placement?: { xM: number; zM: number; rotationYDeg: number };
};

const MM = 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Точка и направление ряда → мир: как группа ряда в сцене (сдвиг и поворот вокруг вертикали). */
function worldOf(placement: { xM: number; zM: number; rotationYDeg: number }) {
  const a = (placement.rotationYDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dir = (v: Vec3): Vec3 => [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
  return { dir, point: (p: Vec3): Vec3 => {
    const d = dir(p);
    return [d[0] + placement.xM, d[1], d[2] + placement.zM];
  } };
}

/** Оси и угол детали в метрах ряда: рамка присадки, а у прочих деталей — по её размерам. */
type RowFrame = { origin: Vec3; ax: Vec3; ay: Vec3; az: Vec3; faceAOnPlusZ: boolean };

function plainFrame(part: Pick<DrillPart, 'lengthMm' | 'widthMm' | 'thicknessMm'>, box: PartBox): RowFrame | null {
  const size = box.scale.map((v) => v * MM);
  const pick = (want: number, taken: number[]): number => {
    let best = -1;
    let diff = Infinity;
    size.forEach((s, i) => {
      if (taken.includes(i)) return;
      if (Math.abs(s - want) < diff) {
        diff = Math.abs(s - want);
        best = i;
      }
    });
    return best;
  };
  const n = pick(part.thicknessMm, []);
  const l = pick(part.lengthMm, [n]);
  const w = pick(part.widthMm, [n, l]);
  if (n < 0 || l < 0 || w < 0) return null;
  /* Вглубь — от передней кромки: y = 0 у полки и перегородки спереди, как у боковины. */
  const unit = (i: number): Vec3 => (i === 2 ? [0, 0, -1] : i === 0 ? [1, 0, 0] : [0, 1, 0]);
  const ax = unit(l);
  const ay = unit(w);
  const az = cross(ax, ay);
  const origin: Vec3 = [0, 0, 0];
  for (const i of [0, 1, 2]) {
    const lo = box.position[i] - box.scale[i] / 2;
    const hi = box.position[i] + box.scale[i] / 2;
    const toward = ax[i] + ay[i] + az[i];
    origin[i] = toward < 0 ? hi : lo;
  }
  return { origin, ax, ay, az, faceAOnPlusZ: true };
}

function holeFrame(part: DrillPart, box: PartBox): RowFrame | null {
  const f = frameOfPart(part, box);
  if (!f) return null;
  const az = cross(f.ax, f.ay);
  const origin: Vec3 = [...f.origin];
  const positive = az[f.normalAxis] > 0;
  /* Нижняя по локальной Z пласть. */
  origin[f.normalAxis] = positive ? Math.min(f.planeA, f.planeB) : Math.max(f.planeA, f.planeB);
  return { origin, ax: f.ax, ay: f.ay, az, faceAOnPlusZ: dot(f.normalA, az) > 0 };
}

/**
 * Контур детали в осях модели. Длинные кромки — вдоль X (отрезки 0 и 2), короткие — вдоль Y (3 и 1); порядок тот же,
 * что считает `edgeSides`: первая длинная — y = 0 (передняя), первая короткая — x = L (верхний торец).
 */
function edgesOf(row: ObjectPanel): BazisEdge[] {
  const bySide = { front: [0, 'y0'], back: [2, 'y1'], top: [1, 'x1'], bottom: [3, 'x0'] } as const;
  const thicknessMm = Number(row.edgeType);
  return edgeSides(row).map((side) => ({ element: bySide[side][0], side: bySide[side][1], thicknessMm, material: `Кромка ${row.edgeType} мм` }));
}

function pickBox(part: DrillPart, boxes: PartBox[], used: Set<PartBox>): PartBox | null {
  const known = boxOfPart(part, boxes);
  if (known && !used.has(known)) return known;
  const want = [part.lengthMm, part.widthMm, part.thicknessMm].sort((a, b) => a - b);
  const same = (b: PartBox) => {
    const have = b.scale.map((v) => v * MM).sort((x, y) => x - y);
    return have.every((v, i) => Math.abs(v - want[i]) <= 1.5);
  };
  const named = boxes.filter((b) => !used.has(b) && (b.panel === part.name || (part.leaf !== undefined && b.partId === part.leaf)));
  return named.find(same) ?? null;
}

export function bazisModel(input: {
  meta: { projectId: string; title: string; date: string; fingerprint: string };
  panels: ObjectPanel[];
  plan: DrillingPlan;
  walls: BazisWall[];
  options: RunBoxesOptions;
  holesMode: BazisHolesMode;
  zone?: Run['zone'];
  /** Имя материала ALDIK → имя в базе БАЗИС цеха: только то, что сопоставил человек. */
  materialMap?: Record<string, string>;
}): BazisModel {
  const { meta, panels, plan, walls, options, holesMode } = input;
  const rowOf = new Map(panels.map((row) => [row.partId, row] as const));
  const materials = new Map<string, BazisMaterial>();
  const materialOf = (name: string, thicknessMm: number, kind: string, decor: string | null): string => {
    const key = `${name}|${thicknessMm}`;
    if (!materials.has(key)) {
      const own = input.materialMap?.[name]?.trim();
      materials.set(key, { key, name, bazisName: own || name, thicknessMm, kind, decor, mapped: Boolean(own) });
    }
    return key;
  };
  const out: BazisPanel[] = [];
  const modules = new Map<string, { id: string; title: string; wall: string }>();

  for (const wall of walls) {
    const placement = wall.placement ?? { xM: -wall.run.lengthMm / 2000, zM: 0, rotationYDeg: 0 };
    const world = worldOf(placement);
    const built = runBoxesByModule(wall.run, options);
    const used = new Set<PartBox>();
    for (const part of plan.parts.filter((p) => p.wallId === wall.wallId)) {
      const row = rowOf.get(part.partId.split('#')[0]);
      if (!row) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: детали ${part.partId} нет в деталировке — модель БАЗИС не собирается`);
      const boxes = built.modules.find((m) => m.unit.id === part.moduleId)?.boxes ?? built.fillers;
      const box = pickBox(part, boxes, used);
      const frame = box ? (holeFrame(part, box) ?? plainFrame(part, box)) : null;
      if (box) used.add(box);
      const moduleKey = `${wall.wallId}:${part.moduleId}`;
      if (!modules.has(moduleKey)) modules.set(moduleKey, { id: moduleKey, title: `${wall.label} · ${part.moduleLabel}`, wall: wall.label });
      const placed = Boolean(frame);
      const origin = frame ? world.point(frame.origin).map((v) => r2(v * MM)) as Vec3 : ([0, 0, 0] as Vec3);
      const axisX = frame ? (world.dir(frame.ax).map(r6) as Vec3) : ([1, 0, 0] as Vec3);
      const axisY = frame ? (world.dir(frame.ay).map(r6) as Vec3) : ([0, 1, 0] as Vec3);
      const axisZ = frame ? (world.dir(frame.az).map(r6) as Vec3) : ([0, 0, 1] as Vec3);
      const corners: Vec3[] = [];
      for (const a of [0, part.lengthMm]) for (const b of [0, part.widthMm]) for (const c of [0, part.thicknessMm]) {
        corners.push([origin[0] + axisX[0] * a + axisY[0] * b + axisZ[0] * c, origin[1] + axisX[1] * a + axisY[1] * b + axisZ[1] * c, origin[2] + axisX[2] * a + axisY[2] * b + axisZ[2] * c]);
      }
      const bound = (k: 0 | 1 | 2, f: (...n: number[]) => number) => r2(f(...corners.map((c) => c[k])));
      const holes: BazisHole[] =
        holesMode === 'none'
          ? []
          : part.ops.map((op) => ({
              id: op.id,
              role: op.role,
              title: DRILL_ROLE_TITLE[op.role],
              ...(op.face ? { face: op.face } : {}),
              ...(op.edge ? { edge: op.edge } : {}),
              xMm: op.xMm,
              yMm: op.yMm,
              ...(op.zMm !== undefined ? { zMm: op.zMm } : {}),
              diameterMm: op.diameterMm,
              depthMm: op.depthMm,
              through: op.through,
              article: op.article,
              source: op.source,
            }));
      out.push({
        id: part.partId,
        number: part.number,
        piece: part.piece,
        name: part.name,
        wall: wall.label,
        moduleId: moduleKey,
        module: part.moduleLabel,
        materialKey: materialOf(row.material, row.thicknessMm, row.stock.kind, row.stock.decor ?? null),
        lengthMm: part.lengthMm,
        widthMm: part.widthMm,
        thicknessMm: part.thicknessMm,
        grain: row.grain,
        placed,
        origin,
        axisX,
        axisY,
        axisZ,
        min: [bound(0, Math.min), bound(1, Math.min), bound(2, Math.min)],
        max: [bound(0, Math.max), bound(1, Math.max), bound(2, Math.max)],
        faceAOnPlusZ: frame?.faceAOnPlusZ ?? true,
        edges: edgesOf(row),
        holes,
        pending: part.pending.map((p) => `${p.what}: ${p.why[0] ?? ''}`),
        shape: row.shape ? 'контур не прямоугольный: здесь заготовка, контур — по детали ALDIK' : null,
        status: part.pending.length > 0 ? 'pending' : holes.length > 0 ? 'ready' : 'no-holes',
      });
    }

    /* Столешница — не деталь раскроя: плита ряда той же `countertopSlabs`, что считает смету и рисует сцену. */
    const thickness = countertopMm(wall.run.production);
    const zone = input.zone ?? wall.run.zone;
    const depth = counterSlabDepthMm(zone, wall.run.production);
    const top = workTopMm(wall.run.production);
    /* Тыл плиты — на стене; перед — на фасад и свес дальше лицевой плоскости корпусов. */
    const frontOverMm = depth - rowStandardDepthMm(zone, 'base', wall.run.production);
    countertopSlabs(wall.run).forEach((slab, s) => {
      slabPieces(slab).forEach((piece, i) => {
        const length = piece.toMm - piece.fromMm;
        const width = depth - piece.backCutMm;
        if (length <= 0 || width <= 0) return;
        const moduleKey = `${wall.wallId}:countertop`;
        if (!modules.has(moduleKey)) modules.set(moduleKey, { id: moduleKey, title: `${wall.label} · Столешница`, wall: wall.label });
        /* Плита: X — вдоль ряда, Y — от передней кромки к стене, Z = X × Y — вверх: начало на нижней пласти. */
        const axisX = world.dir([1, 0, 0]).map(r6) as Vec3;
        const axisY = world.dir([0, 0, -1]).map(r6) as Vec3;
        const axisZ = cross(axisX, axisY).map(r6) as Vec3;
        const rowOrigin: Vec3 = [piece.fromMm / MM, (top - thickness) / MM, frontOverMm / MM];
        const origin = world.point(rowOrigin).map((v) => r2(v * MM)) as Vec3;
        const corners: Vec3[] = [];
        for (const a of [0, length]) for (const b of [0, width]) for (const c of [0, thickness]) {
          corners.push([origin[0] + axisX[0] * a + axisY[0] * b + axisZ[0] * c, origin[1] + axisX[1] * a + axisY[1] * b + axisZ[1] * c, origin[2] + axisX[2] * a + axisY[2] * b + axisZ[2] * c]);
        }
        const bound = (k: 0 | 1 | 2, f: (...n: number[]) => number) => r2(f(...corners.map((c) => c[k])));
        out.push({
          id: `countertop:${wall.wallId}:${s + 1}.${i + 1}`,
          number: `С-${s + 1}.${i + 1}`,
          piece: 1,
          name: 'Столешница',
          wall: wall.label,
          moduleId: moduleKey,
          module: 'Столешница',
          materialKey: materialOf('Столешница', thickness, 'countertop', null),
          lengthMm: length,
          widthMm: width,
          thicknessMm: thickness,
          grain: 'none',
          placed: true,
          origin,
          axisX,
          axisY,
          axisZ,
          min: [bound(0, Math.min), bound(1, Math.min), bound(2, Math.min)],
          max: [bound(0, Math.max), bound(1, Math.max), bound(2, Math.max)],
          faceAOnPlusZ: false,
          edges: [],
          holes: [],
          pending: [],
          shape: slab.outline ? 'плита по дуге: здесь прямоугольная заготовка, контур — по детали ALDIK' : null,
          status: 'no-holes',
        });
      });
    });
  }

  const holes = out.reduce((s, p) => s + p.holes.filter((h) => h.face).length, 0);
  const edgeHoles = out.reduce((s, p) => s + p.holes.filter((h) => h.edge).length, 0);
  return {
    format: 'aldik-bazis-model',
    version: BAZIS_MODEL_VERSION,
    project: meta.projectId,
    title: meta.title,
    exportedAt: meta.date,
    fingerprint: meta.fingerprint,
    units: 'mm',
    holesMode,
    holesWhy: holesMode === 'issued' ? [] : plan.release.reasons,
    materials: Array.from(materials.values()),
    modules: Array.from(modules.values()),
    panels: out,
    counts: {
      panels: out.length,
      placed: out.filter((p) => p.placed).length,
      unplaced: out.filter((p) => !p.placed).length,
      holes,
      edgeHoles,
      edges: out.reduce((s, p) => s + p.edges.length, 0),
      materials: materials.size,
    },
  };
}
