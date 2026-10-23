/**
 * СЕТКА РУЧКИ (HANDLE-REAL) — треугольники в мм по модели `handleModel.ts`.
 *
 * Отдельно от модели намеренно: модель, габарит и посадку читают движок,
 * смета и панель (первая загрузка), а сетку строят только 3D-чанк сцены
 * (`handleGeometry.ts`) и приёмка (`verify-handles.ts`). Сечение кромочной
 * ручки и поворот — те же функции модели: габарит сетки совпадает с
 * `handleBoundsMm` (приёмка H2).
 */
import { RING_PROUD_MM, boundsOfPoints, edgeSection, edgeStations, orientPoint, type HandleBounds, type HandleModel, type HandleOrient, type Point2, type Vec3 } from './handleModel';

/* ─────────────────────────  сетка  ───────────────────────── */

/** Треугольники в мм, в осях ручки после поворота, от точки крепления. */
export type HandleMeshData = { positions: number[]; normals: number[]; indices: number[] };

export type HandleMesh = {
  body: HandleMeshData;
  /** Вторая часть другого материала: резиновые кольца кнопки или тёмное дно врезной. */
  accent: HandleMeshData | null;
  accentKind: 'rubber' | 'cavity' | null;
};

function emptyMesh(): HandleMeshData {
  return { positions: [], normals: [], indices: [] };
}

function pushVertex(mesh: HandleMeshData, p: Vec3, n: Vec3): number {
  mesh.positions.push(p[0], p[1], p[2]);
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  mesh.normals.push(n[0] / len, n[1] / len, n[2] / len);
  return mesh.positions.length / 3 - 1;
}

/**
 * СКОБА — протяжка круга по средней линии прутка.
 *
 * Путь лежит в плоскости xz: стойка вверх от фасада на x = −C/2, дуга гиба,
 * перекладина на высоте B − d/2, дуга, стойка вниз. Кадр сечения
 * постоянный (бинормаль — ось y), поэтому круг не закручивается. Торцы
 * стоек — диски на лице фасада: сетка замкнута.
 */
function barMesh(model: HandleModel, fine: boolean): HandleMeshData {
  const mesh = emptyMesh();
  const d = model.diameterMm;
  const r = d / 2;
  const c = model.centersMm ?? model.lengthMm - d;
  const zc = model.projectionMm - r;
  const bend = Math.max(0.5, Math.min(1.2 * d, zc * 0.8, (c / 2) * 0.9));
  const arcSteps = fine ? 8 : 5;
  const ringSteps = fine ? 20 : 12;

  type Node = { p: [number, number]; t: [number, number] };
  const path: Node[] = [];
  const push = (node: Node) => {
    const last = path[path.length - 1];
    if (last && Math.hypot(last.p[0] - node.p[0], last.p[1] - node.p[1]) < 1e-6) return;
    path.push(node);
  };
  push({ p: [-c / 2, 0], t: [0, 1] });
  for (let i = 0; i <= arcSteps; i += 1) {
    const phi = Math.PI - (Math.PI / 2) * (i / arcSteps);
    push({ p: [-c / 2 + bend + bend * Math.cos(phi), zc - bend + bend * Math.sin(phi)], t: [Math.sin(phi), -Math.cos(phi)] });
  }
  for (let i = 0; i <= arcSteps; i += 1) {
    const phi = Math.PI / 2 - (Math.PI / 2) * (i / arcSteps);
    push({ p: [c / 2 - bend + bend * Math.cos(phi), zc - bend + bend * Math.sin(phi)], t: [Math.sin(phi), -Math.cos(phi)] });
  }
  push({ p: [c / 2, 0], t: [0, -1] });

  const rings: number[][] = [];
  for (const node of path) {
    const [tx, tz] = node.t;
    const n: Vec3 = [tz, 0, -tx];
    const ring: number[] = [];
    for (let j = 0; j < ringSteps; j += 1) {
      const theta = (2 * Math.PI * j) / ringSteps;
      const dir: Vec3 = [Math.cos(theta) * n[0], Math.sin(theta), Math.cos(theta) * n[2]];
      ring.push(pushVertex(mesh, [node.p[0] + r * dir[0], r * dir[1], node.p[1] + r * dir[2]], dir));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let j = 0; j < ringSteps; j += 1) {
      const a = rings[i][j];
      const b = rings[i + 1][j];
      const cc = rings[i + 1][(j + 1) % ringSteps];
      const dd = rings[i][(j + 1) % ringSteps];
      mesh.indices.push(a, cc, b, a, dd, cc);
    }
  }
  /* Торцы стоек — на лице фасада, смотрят в фасад. */
  for (const [at, sign] of [
    [0, -1],
    [rings.length - 1, 1],
  ] as [number, number][]) {
    const node = path[at];
    const normal: Vec3 = [node.t[0] * sign, 0, node.t[1] * sign];
    const center = pushVertex(mesh, [node.p[0], 0, node.p[1]], normal);
    const ring = rings[at].map((index) => {
      const p: Vec3 = [mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2]];
      return pushVertex(mesh, p, normal);
    });
    /* Обе стойки кончаются на лице фасада: оба торца смотрят в фасад (−z). */
    for (let j = 0; j < ringSteps; j += 1) {
      const a = ring[j];
      const b = ring[(j + 1) % ringSteps];
      if (sign < 0) mesh.indices.push(center, b, a);
      else mesh.indices.push(center, a, b);
    }
  }
  return mesh;
}

/**
 * ТЕЛО ВРАЩЕНИЯ вокруг оси z по профилю (r, z). Нормали плоские на каждом
 * участке профиля — кромки фаски читаются, — и гладкие вокруг оси.
 */
function latheMesh(mesh: HandleMeshData, profile: Point2[], steps: number): void {
  for (let k = 0; k < profile.length - 1; k += 1) {
    const [r0, z0] = profile[k];
    const [r1, z1] = profile[k + 1];
    const dr = r1 - r0;
    const dz = z1 - z0;
    const len = Math.hypot(dr, dz);
    if (len < 1e-9) continue;
    const nr = dz / len;
    const nz = -dr / len;
    /* Шов не повторяется: вершина на 2π — та же, что на нуле (индекс по модулю, как у скобы). */
    const start: number[] = [];
    const end: number[] = [];
    for (let j = 0; j < steps; j += 1) {
      const phi = (2 * Math.PI * j) / steps;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const normal: Vec3 = [nr * cos, nr * sin, nz];
      start.push(pushVertex(mesh, [r0 * cos, r0 * sin, z0], normal));
      end.push(pushVertex(mesh, [r1 * cos, r1 * sin, z1], normal));
    }
    for (let j = 0; j < steps; j += 1) {
      const a = start[j];
      const b = end[j];
      const c = end[(j + 1) % steps];
      const d = start[(j + 1) % steps];
      if (r0 < 1e-9) mesh.indices.push(a, c, b);
      else if (r1 < 1e-9) mesh.indices.push(a, d, c);
      else mesh.indices.push(a, c, b, a, d, c);
    }
  }
}

function knobMesh(model: HandleModel, fine: boolean): { body: HandleMeshData; rings: HandleMeshData | null } {
  const body = emptyMesh();
  const r = model.diameterMm / 2;
  const h = model.projectionMm;
  const chamfer = Math.min(1, r * 0.12, h * 0.1);
  const steps = fine ? 28 : 16;
  latheMesh(
    body,
    [
      [0, 0],
      [r, 0],
      [r, h - chamfer],
      [r - chamfer, h],
      [0, h],
    ],
    steps,
  );
  if (!model.rings) return { body, rings: null };
  /* Кольца — у свободного конца, заподлицо с телом (место колец не образмерено). */
  const rings = emptyMesh();
  const band = Math.max(0.6, h * 0.06);
  for (const at of [0.62, 0.76]) {
    const z0 = h * at;
    const z1 = Math.min(h - chamfer, z0 + band);
    latheMesh(
      rings,
      [
        [r - 0.6, z0],
        [r + RING_PROUD_MM, z0],
        [r + RING_PROUD_MM, z1],
        [r - 0.6, z1],
        [r - 0.6, z0],
      ],
      steps,
    );
  }
  return { body, rings };
}

function flushMesh(model: HandleModel, fine: boolean): { body: HandleMeshData; cavity: HandleMeshData } {
  const body = emptyMesh();
  const outer = model.diameterMm / 2;
  const inner = (model.bodyDiameterMm ?? model.diameterMm * 0.8) / 2;
  const t = model.projectionMm;
  /* Шагов кратно четырём: крайние точки по x и y лежат ровно на габарите. */
  const steps = fine ? 32 : 20;
  /* Фланец — кольцо на лице фасада: нижняя грань, наружный край, верх, внутренний край. */
  latheMesh(
    body,
    [
      [inner, 0],
      [outer, 0],
      [outer, t],
      [inner, t],
      [inner, 0],
    ],
    steps,
  );
  /* Дно корпуса — тёмный диск в кольце: углубление в фасаде не вырезано, оно показано светом. */
  const cavity = emptyMesh();
  const floor = Math.min(0.4, t * 0.4);
  latheMesh(
    cavity,
    [
      [0, 0.05],
      [inner, 0.05],
      [inner, floor],
      [0, floor],
    ],
    steps,
  );
  return { body, cavity };
}

/**
 * РУЧКА НА КРОМКЕ — сечение, протянутое вдоль длины (у волнистой — по станциям).
 * Боковые грани плоские, торцы закрыты: сетка замкнута.
 */
function edgeMesh(model: HandleModel, frontMm: number): HandleMeshData {
  const mesh = emptyMesh();
  const stations = edgeStations(model);
  const sections = stations.map((u) => {
    let poly = edgeSection(model, frontMm, u);
    /* Против часовой в (z, y): так грани смотрят наружу. */
    let area = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const [a0, b0] = poly[i];
      const [a1, b1] = poly[(i + 1) % poly.length];
      area += a0 * b1 - a1 * b0;
    }
    if (area < 0) poly = poly.slice().reverse();
    return poly;
  });
  const count = sections[0].length;
  const at = (s: number, k: number): Vec3 => [stations[s], sections[s][k][1], sections[s][k][0]];
  /* Боковые грани: четырёхугольник ребра k между станциями s и s + 1. */
  for (let s = 0; s < stations.length - 1; s += 1) {
    for (let k = 0; k < count; k += 1) {
      const k1 = (k + 1) % count;
      const a = at(s, k);
      const b = at(s, k1);
      const c = at(s + 1, k1);
      const d = at(s + 1, k);
      const e1: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const e2: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const n: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const ia = pushVertex(mesh, a, n);
      const ib = pushVertex(mesh, b, n);
      const ic = pushVertex(mesh, c, n);
      const id = pushVertex(mesh, d, n);
      mesh.indices.push(ia, ic, ib, ia, id, ic);
    }
  }
  /* Торцы: многоугольник сечения веером от первой вершины — он выпуклый по частям, поэтому полосами. */
  for (const [s, sign] of [
    [0, -1],
    [stations.length - 1, 1],
  ] as [number, number][]) {
    const normal: Vec3 = [sign, 0, 0];
    const poly = sections[s];
    const half = count / 2;
    const ids = poly.map((_, k) => pushVertex(mesh, at(s, k), normal));
    /* Полосы между левой и правой стороной толстой ломаной (k и count − 1 − k). */
    for (let k = 0; k < half - 1; k += 1) {
      const a = ids[k];
      const b = ids[k + 1];
      const c = ids[count - 2 - k];
      const d = ids[count - 1 - k];
      const tri = (x: number, y: number, z: number) => {
        const p = (i: number): Vec3 => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
        const [pa, pb, pc] = [p(x), p(y), p(z)];
        const nx = (pb[1] - pa[1]) * (pc[2] - pa[2]) - (pb[2] - pa[2]) * (pc[1] - pa[1]);
        if (nx * sign >= 0) mesh.indices.push(x, y, z);
        else mesh.indices.push(x, z, y);
      };
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  return mesh;
}

function orientMesh(mesh: HandleMeshData, orient: HandleOrient): HandleMeshData {
  if (orient === 'h' || orient === 'top') return mesh;
  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = orientPoint([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]], orient);
    const n = orientPoint([mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]], orient);
    positions.push(...p);
    normals.push(...n);
  }
  return { positions, normals, indices: mesh.indices };
}

/**
 * СЕТКА РУЧКИ, мм, в осях ручки после поворота, от точки крепления.
 *
 * `fine` — подробная (сцена, карточка); грубая — для мелкого вида и
 * экономичного режима: та же форма и тот же габарит, меньше граней.
 */
export function handleMesh(model: HandleModel, orient: HandleOrient, frontMm: number, fine = true): HandleMesh {
  if (model.shape === 'bar') return { body: orientMesh(barMesh(model, fine), orient), accent: null, accentKind: null };
  if (model.shape === 'knob') {
    const { body, rings } = knobMesh(model, fine);
    return { body: orientMesh(body, orient), accent: rings ? orientMesh(rings, orient) : null, accentKind: rings ? 'rubber' : null };
  }
  if (model.shape === 'flush') {
    const { body, cavity } = flushMesh(model, fine);
    return { body: orientMesh(body, orient), accent: orientMesh(cavity, orient), accentKind: 'cavity' };
  }
  return { body: orientMesh(edgeMesh(model, frontMm), orient), accent: null, accentKind: null };
}

/** Габарит сетки по вершинам — для приёмки: обязан совпасть с `handleBoundsMm`. */
export function meshBoundsMm(mesh: HandleMesh): HandleBounds {
  const points: Vec3[] = [];
  for (const part of [mesh.body, mesh.accent]) {
    if (!part) continue;
    for (let i = 0; i < part.positions.length; i += 3) points.push([part.positions[i], part.positions[i + 1], part.positions[i + 2]]);
  }
  return boundsOfPoints(points);
}
