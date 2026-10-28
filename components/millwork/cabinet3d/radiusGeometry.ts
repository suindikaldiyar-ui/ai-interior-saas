import * as THREE from 'three';
import { formPrism, type PlanPath, type RadiusForm } from '@/lib/millwork/radius';

/**
 * СЕТКА РАДИУСНОЙ ДЕТАЛИ — ИЗ ТОЙ ЖЕ ФОРМЫ, ЧТО У РАСКРОЯ (OVAL & RADIUS).
 *
 * Деталь — призма (`formPrism`): контур в плане, выдавленный по высоте. Дуга
 * дробится с отходом хорды не больше 0,5 мм (как `samplePath`), бок дуги — с
 * гладкими нормалями по радиусу: гранёный фасад читался бы многоугольником, а
 * не дугой. Прямые стороны и торцы — плоские. Развёртка текстуры — метрами
 * грани по той же паре осей, что у шейдера «в настоящем размере»
 * (`realSizeMap`): лицо — X и Y, торец — Z и Y, верх и низ — X и Z.
 *
 * Сетка стоит в координатах РЯДА (метры): ноль модуля — `originM` детали.
 * Деталей одного материала — одна сетка: пачка, как у коробок.
 */

const MM = 1000;
const TOLERANCE_MM = 0.5;

type V2 = [number, number];
type Edge = { p: V2; q: V2; np?: V2; nq?: V2 };

/** Рёбра контура: отрезок — как есть, дуга — хордами, у её вершин нормаль по радиусу. */
function edgesOf(path: PlanPath): Edge[] {
  const out: Edge[] = [];
  for (const seg of path) {
    if (seg.kind === 'line') {
      out.push({ p: [seg.a[0], seg.a[1]], q: [seg.b[0], seg.b[1]] });
      continue;
    }
    const sweep = seg.to - seg.from;
    const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - TOLERANCE_MM / Math.max(seg.r, 1e-6))));
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-3)));
    const at = (t: number): V2 => [seg.c[0] + seg.r * Math.cos(t), seg.c[1] + seg.r * Math.sin(t)];
    const radial = (t: number): V2 => [Math.cos(t), Math.sin(t)];
    for (let i = 0; i < n; i += 1) {
      const t0 = seg.from + (sweep * i) / n;
      const t1 = seg.from + (sweep * (i + 1)) / n;
      out.push({ p: at(t0), q: at(t1), np: radial(t0), nq: radial(t1) });
    }
  }
  return out.filter((edge) => Math.hypot(edge.q[0] - edge.p[0], edge.q[1] - edge.p[1]) > 1e-4);
}

type Buffers = { position: number[]; normal: number[]; uv: number[] };

/** Развёртка вершины — та же пара осей, что у шейдера «в настоящем размере». */
function pushVertex(out: Buffers, at: [number, number, number], n: [number, number, number]): void {
  out.position.push(at[0], at[1], at[2]);
  out.normal.push(n[0], n[1], n[2]);
  if (Math.abs(n[2]) > 0.5) out.uv.push(at[0], at[1]);
  else if (Math.abs(n[0]) > 0.5) out.uv.push(at[2], at[1]);
  else out.uv.push(at[0], at[2]);
}

/** Призма детали в буферы: бока, верх и низ. Координаты ряда, метры. */
function prismInto(out: Buffers, form: RadiusForm, originM: [number, number, number]): void {
  const prism = formPrism(form);
  const edges = edgesOf(prism.path);
  if (edges.length < 3) return;
  const x = (mm: number) => originM[0] + mm / MM;
  const z = (mm: number) => originM[2] + mm / MM;
  const y0 = originM[1] + prism.y0 / MM;
  const y1 = originM[1] + prism.y1 / MM;

  /* Обход контура: знак площади решает, куда смотрит наружу. */
  let twice = 0;
  for (const edge of edges) twice += edge.p[0] * edge.q[1] - edge.q[0] * edge.p[1];
  const ccw = twice > 0;

  for (const edge of edges) {
    const dx = edge.q[0] - edge.p[0];
    const dz = edge.q[1] - edge.p[1];
    const len = Math.hypot(dx, dz);
    /* Наружу: у обхода против часовой — (dz, −dx). */
    const flat: V2 = ccw ? [dz / len, -dx / len] : [-dz / len, dx / len];
    const smooth = (n: V2 | undefined): V2 => {
      if (!n) return flat;
      return n[0] * flat[0] + n[1] * flat[1] >= 0 ? n : [-n[0], -n[1]];
    };
    const np = smooth(edge.np);
    const nq = smooth(edge.nq);
    const P0: [number, number, number] = [x(edge.p[0]), y0, z(edge.p[1])];
    const Q0: [number, number, number] = [x(edge.q[0]), y0, z(edge.q[1])];
    const P1: [number, number, number] = [x(edge.p[0]), y1, z(edge.p[1])];
    const Q1: [number, number, number] = [x(edge.q[0]), y1, z(edge.q[1])];
    const NP: [number, number, number] = [np[0], 0, np[1]];
    const NQ: [number, number, number] = [nq[0], 0, nq[1]];
    /* Порядок обхода треугольника — лицом наружу (у обхода против часовой — обратный). */
    const tris: [[number, number, number], [number, number, number]][][] = ccw
      ? [
          [[P0, NP], [Q1, NQ], [Q0, NQ]],
          [[P0, NP], [P1, NP], [Q1, NQ]],
        ]
      : [
          [[P0, NP], [Q0, NQ], [Q1, NQ]],
          [[P0, NP], [Q1, NQ], [P1, NP]],
        ];
    for (const tri of tris) for (const [at, n] of tri) pushVertex(out, at, n);
  }

  /* Верх и низ — триангуляция контура; лицо — вверх у верха и вниз у низа. */
  const contour = edges.map((edge) => new THREE.Vector2(edge.p[0], edge.p[1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [cap, y, up] of [
    ['top', y1, 1],
    ['bottom', y0, -1],
  ] as const) {
    void cap;
    for (const face of faces) {
      const [a, b, c] = face.map((i) => contour[i]);
      /* y-компонента нормали треугольника (a, b, c) в осях x, y, z. */
      const ny = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
      const order = ny * up > 0 ? [a, b, c] : [a, c, b];
      for (const p of order) pushVertex(out, [x(p.x), y, z(p.y)], [0, up, 0]);
    }
  }
}

/**
 * СЕТКА ДЕТАЛЕЙ ОДНИМ БУФЕРОМ — для пачки одного материала или одного полотна.
 * Пусто — пустая сетка (вызывающий её не рисует).
 */
export function shapedGeometry(items: { form: RadiusForm; originM: [number, number, number] }[]): THREE.BufferGeometry {
  const out: Buffers = { position: [], normal: [], uv: [] };
  for (const item of items) prismInto(out, item.form, item.originM);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
