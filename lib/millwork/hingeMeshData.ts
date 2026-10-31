import { hingeParts, type HingeBox, type HingeModel } from './hingeModel';

/**
 * СЕТКА ПЕТЛИ В ММ (HW-03) — только 3D-чанк и приёмка. Части — `hingeParts`
 * (чашка цилиндром, фланец, корпус шарнира; планка и плечо). Звенья сюда не
 * входят: они соединяют неподвижное плечо с едущей чашкой и строятся сценой
 * на каждом шаге хода (`linkPose`).
 */

export type MeshData = { positions: number[]; normals: number[]; indices: number[] };

function empty(): MeshData {
  return { positions: [], normals: [], indices: [] };
}

function pushBox(mesh: MeshData, box: HingeBox, mirror: boolean): void {
  const sx = mirror ? -1 : 1;
  const [x0, y0, z0] = box.min;
  const [x1, y1, z1] = box.max;
  const faces: { n: [number, number, number]; v: [number, number, number][] }[] = [
    { n: [1, 0, 0], v: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
    { n: [-1, 0, 0], v: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]] },
    { n: [0, 1, 0], v: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]] },
    { n: [0, -1, 0], v: [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]] },
    { n: [0, 0, 1], v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { n: [0, 0, -1], v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
  ];
  for (const face of faces) {
    const base = mesh.positions.length / 3;
    for (const [x, y, z] of face.v) {
      mesh.positions.push(x * sx, y, z);
      mesh.normals.push(face.n[0] * sx, face.n[1], face.n[2]);
    }
    if (mirror) mesh.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** Цилиндр вдоль Z: ось (cx, cy), от z0 до z1, со дном на z1 (дно чашки в фасаде). */
function pushCylinder(mesh: MeshData, cx: number, cy: number, r: number, z0: number, z1: number, segments: number, mirror: boolean): void {
  const sx = mirror ? -1 : 1;
  const ring = (z: number) => Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z] as const;
  });
  const lower = ring(z0);
  const upper = ring(z1);
  for (let i = 0; i < segments; i += 1) {
    const j = (i + 1) % segments;
    const base = mesh.positions.length / 3;
    for (const p of [lower[i], lower[j], upper[j], upper[i]]) {
      mesh.positions.push(p[0] * sx, p[1], p[2]);
      const nx = (p[0] - cx) / r;
      const ny = (p[1] - cy) / r;
      mesh.normals.push(nx * sx, ny, 0);
    }
    if (mirror) mesh.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /* Дно чашки. */
  const centre = mesh.positions.length / 3;
  mesh.positions.push(cx * sx, cy, z1);
  mesh.normals.push(0, 0, 1);
  for (let i = 0; i < segments; i += 1) {
    mesh.positions.push(upper[i][0] * sx, upper[i][1], z1);
    mesh.normals.push(0, 0, 1);
  }
  for (let i = 0; i < segments; i += 1) {
    const a = centre + 1 + i;
    const b = centre + 1 + ((i + 1) % segments);
    if (mirror) mesh.indices.push(centre, b, a);
    else mesh.indices.push(centre, a, b);
  }
}

/** Брусок от точки к точке (звено): квадратное сечение `width`. */
export function pushBeam(mesh: MeshData, from: [number, number, number], to: [number, number, number], width: number, mirror: boolean): void {
  const sx = mirror ? -1 : 1;
  const a: [number, number, number] = [from[0] * sx, from[1], from[2]];
  const b: [number, number, number] = [to[0] * sx, to[1], to[2]];
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1e-9;
  const u = [d[0] / len, d[1] / len, d[2] / len];
  /* Два перпендикуляра к оси звена. */
  const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const v = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
  const vl = Math.hypot(v[0], v[1], v[2]);
  const vn = [v[0] / vl, v[1] / vl, v[2] / vl];
  const w = [u[1] * vn[2] - u[2] * vn[1], u[2] * vn[0] - u[0] * vn[2], u[0] * vn[1] - u[1] * vn[0]];
  const h = width / 2;
  const corner = (p: [number, number, number], s: number, t: number): [number, number, number] => [
    p[0] + (vn[0] * s + w[0] * t) * h,
    p[1] + (vn[1] * s + w[1] * t) * h,
    p[2] + (vn[2] * s + w[2] * t) * h,
  ];
  const sides: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i += 1) {
    const [s0, t0] = sides[i];
    const [s1, t1] = sides[(i + 1) % 4];
    const n = [vn[0] * (s0 + s1) + w[0] * (t0 + t1), vn[1] * (s0 + s1) + w[1] * (t0 + t1), vn[2] * (s0 + s1) + w[2] * (t0 + t1)];
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    const base = mesh.positions.length / 3;
    for (const p of [corner(a, s0, t0), corner(b, s0, t0), corner(b, s1, t1), corner(a, s1, t1)]) {
      mesh.positions.push(p[0], p[1], p[2]);
      mesh.normals.push(n[0] / nl, n[1] / nl, n[2] / nl);
    }
    mesh.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}

/**
 * Половина петли: `cup` — едет с фасадом, `arm` — стоит на боковине.
 * `mirror` — петли справа (ось X отражена, обход граней перевёрнут: нормали наружу).
 */
export function hingeHalfMesh(model: HingeModel, half: 'cup' | 'arm', sideInnerXMm: number, mirror: boolean, fine = true, withLinks = false): MeshData {
  const parts = hingeParts(model, sideInnerXMm);
  const mesh = empty();
  if (half === 'cup') {
    pushCylinder(mesh, parts.cup.center[0], parts.cup.center[1], parts.cup.radius, 0, parts.cup.depth, fine ? 28 : 12, mirror);
    for (const box of parts.cupBoxes) pushBox(mesh, box, mirror);
    /* Закрытая петля в пачке — со звеньями в закрытой позе; на ходу их строит сцена. */
    if (withLinks) for (const link of parts.links) pushBeam(mesh, link.fixed, link.moving, link.widthMm, mirror);
  } else {
    for (const box of parts.armBoxes) pushBox(mesh, box, mirror);
  }
  return mesh;
}

/** Габарит сетки — приёмка сверяет, что сетка там, где коробка узла. */
export function meshBounds(mesh: MeshData): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], mesh.positions[i + k]);
      max[k] = Math.max(max[k], mesh.positions[i + k]);
    }
  }
  return { min, max };
}

/**
 * Поза звена на ходу: неподвижная точка плеча и точка корпуса шарнира,
 * повёрнутая с фасадом. `rotate` — поворот точки фасада в координаты
 * корпуса (тот же, что у полотна сцены). Возвращает середину, длину и
 * единичное направление — сцена ставит по ним тонкий брусок.
 */
export function linkPose(
  fixed: [number, number, number],
  movingClosed: [number, number, number],
  rotate: (p: [number, number, number]) => [number, number, number],
): { mid: [number, number, number]; length: number; dir: [number, number, number] } {
  const m = rotate(movingClosed);
  const d: [number, number, number] = [m[0] - fixed[0], m[1] - fixed[1], m[2] - fixed[2]];
  const length = Math.hypot(d[0], d[1], d[2]) || 1e-9;
  return { mid: [(m[0] + fixed[0]) / 2, (m[1] + fixed[1]) / 2, (m[2] + fixed[2]) / 2], length, dir: [d[0] / length, d[1] / length, d[2] / length] };
}
