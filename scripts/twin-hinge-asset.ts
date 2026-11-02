/**
 * GLB ПЕТЛИ Blum CLIP top BLUMOTION 110° 71B3550 С ПЛАНКОЙ 175H3130 — ВИЗУАЛЬНАЯ
 * РЕКОНСТРУКЦИЯ ПО ЧЕРТЕЖАМ BLUM (не CAD производителя).
 *
 * Геометрия — `lib/millwork/clipTopHinge.ts` (напечатанное отдельно от снятого).
 * Узлы и роли (как их пишет «Импорт CAD-фурнитуры»):
 *   едут с фасадом — `cup` (чашка), `flange` (фланец), `cup-screws` (саморезы
 *     чашки), `cup-pins` (щёки и оси шарнира в чашке — A1, B1);
 *   стоят на боковине — `arm` (плечо-швеллер), `arm-head` (нос плеча: щёки и
 *     оси A0, B0), `damper` (демпфер BLUMOTION), `mounting-plate` (планка
 *     175H3130), `plate-screws` (саморезы планки).
 * Звенья четырёхзвенника (`CLIP_TOP_110_OVERLAY`) в файле не лежат: они не едут
 * ни с фасадом, ни с корпусом — их ставит сцена на каждом шаге хода, между
 * щёк, от оси плеча к оси чашки.
 * Планка — в файле петли: сцена рисует петлю и планку одной половиной «плечо»
 * (`hingeParts`), отдельной модели планки у сцены нет.
 * Оси — мм, начало — ось чашки на тыле фасада; +X внутрь фасада, +Y вверх,
 * +Z в фасад. Левая петля; правая — отражением сцены.
 *
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/twin-hinge-asset.ts <папка>`
 * Выход — JSON: путь, габарит, узлы.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { CT_PRINTED, CT_TRACE, PLATE_PRINTED, armSpanXMm, cupScrewPointsMm, flangeOutline, plateCenterZMm, plateHoleZMm, sideInnerXMm, type Outline } from '../lib/millwork/clipTopHinge';
import { CLIP_TOP_110_OVERLAY } from '../lib/millwork/hingeLinkage';
import { merge, writeGlb, type GlbMaterial, type GlbPart } from './twin-glb';


/* Никелированная сталь (NI в таблице заказа pdf 80), цинк саморезов, пластик демпфера. */
const NICKEL: GlbMaterial = { name: 'nickel-plated-steel', color: [0.78, 0.77, 0.74], metallic: 1, roughness: 0.3 };
const ZINC: GlbMaterial = { name: 'zinc-steel', color: [0.7, 0.71, 0.72], metallic: 1, roughness: 0.35 };
const DAMPER: GlbMaterial = { name: 'damper-plastic', color: [0.16, 0.16, 0.17], metallic: 0, roughness: 0.55 };

const shapeOf = (points: Outline, holes: Outline[] = []) => {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
};
const circle = (cx: number, cy: number, r: number, n = 40): Outline =>
  Array.from({ length: n }, (_, i) => {
    const a = (-2 * Math.PI * i) / n; /* по часовой — отверстие */
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
const box = (min: [number, number, number], max: [number, number, number]) => {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
};
/** Цилиндр по оси: 'x' | 'y' | 'z', центр и длина. */
const cylinder = (axis: 'x' | 'y' | 'z', d: number, length: number, at: [number, number, number], open = false) => {
  const g = new THREE.CylinderGeometry(d / 2, d / 2, length, 40, 1, open);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(at[0], at[1], at[2]);
  return g;
};
/** Контур в плоскости (x, z), выдавленный вдоль Y от y0 на толщину. */
const extrudeXZ = (points: Outline, y0: number, thickness: number) => {
  const g = new THREE.ExtrudeGeometry(shapeOf(points), { depth: thickness, bevelEnabled: false, curveSegments: 8 });
  /* (x, s, e) → (x, −e, s): вторая координата контура — Z модели, выдавливание — вдоль −Y. */
  g.rotateX(Math.PI / 2);
  g.translate(0, y0 + thickness, 0);
  return g;
};

const r = CT_PRINTED.cupDiameterMm / 2;
const side = sideInnerXMm();

/* ── едет с фасадом ── */
const cupParts = [
  /* Стакан чашки в фасаде: стенка и дно (глубина — BT 13). */
  cylinder('z', CT_PRINTED.cupDiameterMm, CT_PRINTED.cupDepthMm, [0, 0, CT_PRINTED.cupDepthMm / 2], true),
  cylinder('z', CT_TRACE.cupInnerDiameterMm, CT_PRINTED.cupDepthMm - 1, [0, 0, (CT_PRINTED.cupDepthMm - 1) / 2], true),
  cylinder('z', CT_PRINTED.cupDiameterMm, 1, [0, 0, CT_PRINTED.cupDepthMm - 0.5]),
];
const flange = new THREE.ExtrudeGeometry(shapeOf(flangeOutline(), [circle(0, 0, CT_TRACE.cupInnerDiameterMm / 2)]), { depth: CT_PRINTED.flangeHeightMm, bevelEnabled: false, curveSegments: 8 });
flange.translate(0, 0, -CT_PRINTED.flangeHeightMm);
/* Головки саморезов чашки — сферические сегменты на фланце (ось −Z, в корпус). */
const cupScrews = cupScrewPointsMm().map(([x, y]) => {
  const d = CT_TRACE.cupScrewHeadDiameterMm;
  const h = CT_TRACE.cupScrewHeadHeightMm;
  const rad = (d * d) / (8 * h) + h / 2;
  const g = new THREE.SphereGeometry(rad, 24, 8, 0, Math.PI * 2, 0, Math.acos((rad - h) / rad));
  g.translate(0, -(rad - h), 0);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, -CT_PRINTED.flangeHeightMm);
  return g;
});
/**
 * ЩЕКА В ПЛОСКОСТИ ХОДА: выпуклая оболочка проушин вокруг осей (и опорных точек),
 * выдавленная вдоль Y на толщину щеки — с обеих сторон звеньев.
 */
const hull = (points: [number, number][]): Outline => {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};
const eye = (c: [number, number], rr: number): [number, number][] => Array.from({ length: 16 }, (_, k) => [c[0] + rr * Math.cos((2 * Math.PI * k) / 16), c[1] + rr * Math.sin((2 * Math.PI * k) / 16)] as [number, number]);
const cheekPair = (outline: Outline) => {
  const y0 = CT_TRACE.cheekInnerYMm;
  return [extrudeXZ(outline, y0, CT_TRACE.cheekMm), extrudeXZ(outline, -y0 - CT_TRACE.cheekMm, CT_TRACE.cheekMm)];
};
/** Ось шарнира поперёк щёк (вдоль Y) с головками заклёпки. */
const pinAt = (c: [number, number]) => {
  const span = 2 * (CT_TRACE.cheekInnerYMm + CT_TRACE.cheekMm);
  return [
    cylinder('y', CT_TRACE.pinDiameterMm, span + 0.8, [c[0], 0, c[1]]),
    cylinder('y', CT_TRACE.pinDiameterMm + 1.4, 0.5, [c[0], span / 2 + 0.4, c[1]]),
    cylinder('y', CT_TRACE.pinDiameterMm + 1.4, 0.5, [c[0], -span / 2 - 0.4, c[1]]),
  ];
};
const bar = CLIP_TOP_110_OVERLAY.bar;
/* В чашке: щёки от дна чашки к осям A1, B1 (дно — на глубине чашки, за осями). */
const cupFloor = CT_PRINTED.cupDepthMm - 1.2;
const cupCheek = hull([...eye(bar.a1, CT_TRACE.eyeRadiusMm), ...eye(bar.b1, CT_TRACE.eyeRadiusMm), [bar.a1[0], cupFloor], [bar.b1[0], cupFloor]]);
const cupPins = [...cheekPair(cupCheek), ...pinAt(bar.a1), ...pinAt(bar.b1)];

/* ── стоит на боковине ── */
const { bottom: armBottom, top: armTop } = armSpanXMm();
const wall = CT_TRACE.armWallMm;
const rear = -CT_PRINTED.armLengthMm;
const nose = CT_TRACE.armNoseZMm;
/**
 * ПЛЕЧО — штампованная оболочка-«арка», открытая к боковине: по длине Z меняются
 * полуширина w, верх t и низ b (форма снята с фото и чертежа; напечатаны только
 * задний конец −SL и высота плеча). Сечение — полуэллипс от (b, −w) через (t, 0)
 * к (b, +w), внутренняя поверхность — на толщину стенки.
 */
type Station = { z: number; w: number; t: number; b: number };
const halfW = CT_TRACE.armWidthMm / 2;
/* Швеллер плеча кончается у носа; дальше — щёки носа с осями A0, B0 (`arm-head`). */
const stations: Station[] = [
  { z: rear, w: halfW - 3, t: armTop - 4, b: armBottom },
  { z: rear + 1.5, w: halfW - 1, t: armTop - 1.5, b: armBottom },
  { z: rear + 4, w: halfW, t: armTop, b: armBottom },
  { z: -30, w: halfW, t: armTop, b: armBottom },
  { z: -22, w: halfW - 0.8, t: armTop - 1.2, b: armBottom - 1 },
  { z: nose, w: halfW - 1.8, t: armTop - 3.5, b: armBottom - 3 },
];
/* Нос: щёки от сечения швеллера у носа к проушинам осей A0, B0 — внутри плеча по высоте (не выше SH). */
const noseCheek = hull([
  ...eye(bar.a0, CT_TRACE.eyeRadiusMm),
  ...eye(bar.b0, CT_TRACE.eyeRadiusMm),
  [armBottom - 3, nose - 2],
  [armTop - 3.5, nose - 2],
]);
const armHead = [...cheekPair(noseCheek), ...pinAt(bar.a0), ...pinAt(bar.b0)];
const ARC = 18;
function archShell(list: Station[]): THREE.BufferGeometry {
  const ring = (st: Station, inner: boolean) =>
    Array.from({ length: ARC + 1 }, (_, j) => {
      const a = (Math.PI * j) / ARC;
      const w = inner ? st.w - wall : st.w;
      const h = inner ? st.t - st.b - wall : st.t - st.b;
      return new THREE.Vector3(st.b + h * Math.sin(a), -w * Math.cos(a), st.z);
    });
  const outer = list.map((st) => ring(st, false));
  const inner = list.map((st) => ring(st, true));
  const tri: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tri.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  for (let i = 0; i + 1 < list.length; i += 1) {
    for (let j = 0; j < ARC; j += 1) {
      quad(outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j + 1]);
      quad(inner[i][j + 1], inner[i + 1][j + 1], inner[i + 1][j], inner[i][j]);
    }
    /* Кромки швеллера у боковины. */
    quad(outer[i][0], inner[i][0], inner[i + 1][0], outer[i + 1][0]);
    quad(outer[i + 1][ARC], inner[i + 1][ARC], inner[i][ARC], outer[i][ARC]);
  }
  /* Торцы: задний — кольцо стенки, передний уходит в корпус шарнира. */
  for (const i of [0, list.length - 1]) for (let j = 0; j < ARC; j += 1) quad(outer[i][j], outer[i][j + 1], inner[i][j + 1], inner[i][j]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  return g;
}
const arm = [archShell(stations)];
const damper = [cylinder('z', CT_TRACE.damperDiameterMm, CT_TRACE.damperZMm[1] - CT_TRACE.damperZMm[0], [armBottom + CT_TRACE.damperDiameterMm / 2 + 1.5, 0, (CT_TRACE.damperZMm[0] + CT_TRACE.damperZMm[1]) / 2])];

/** Скруглённый прямоугольник (u, v) — контур основания и ступени планки. */
const roundRect = (u0: number, v0: number, u1: number, v1: number, rr: number): Outline => {
  const pts: Outline = [];
  const corner = (cu: number, cv: number, a0: number) => {
    for (let i = 0; i <= 6; i += 1) {
      const a = a0 + (Math.PI / 2) * (i / 6);
      pts.push([cu + rr * Math.cos(a), cv + rr * Math.sin(a)]);
    }
  };
  corner(u1 - rr, v0 + rr, -Math.PI / 2);
  corner(u1 - rr, v1 - rr, 0);
  corner(u0 + rr, v1 - rr, Math.PI / 2);
  corner(u0 + rr, v0 + rr, Math.PI);
  return pts;
};
/** Контур в плоскости (z, y), выдавленный вдоль +X от x0 на высоту (с фаской 0,6). */
const extrudeZY = (points: Outline, x0: number, height: number) => {
  const g = new THREE.ExtrudeGeometry(shapeOf(points), { depth: height, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2, curveSegments: 6 });
  /* (u, v, e): u — Z модели, v — Y, e — X (фаска выходит на 0,6 за обе грани). */
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const u = pos.getX(i);
    const v = pos.getY(i);
    const e = pos.getZ(i);
    pos.setXYZ(i, x0 + 0.6 + e, v, u);
  }
  return g;
};
const pc = plateCenterZMm();
const pl = PLATE_PRINTED.lengthMm / 2;
const pw = PLATE_PRINTED.widthMm / 2;
const plate = [
  /* Основание 58,3 × 18,7 со скруглёнными концами; средняя ступень до H 11,5 под плечо. */
  extrudeZY(roundRect(pc - pl + 0.6, -pw + 0.6, pc + pl - 0.6, pw - 0.6, 6), side, CT_TRACE.plateBaseMm - 1.2),
  extrudeZY(roundRect(pc - CT_TRACE.plateRidgeLengthMm / 2, -CT_TRACE.plateRidgeWidthMm / 2, pc + CT_TRACE.plateRidgeLengthMm / 2, CT_TRACE.plateRidgeWidthMm / 2, 3), side + CT_TRACE.plateBaseMm, PLATE_PRINTED.heightMm - CT_TRACE.plateBaseMm - 1.2),
  /* Эксцентрик регулировки по высоте — головка на торце ступени. */
  cylinder('z', CT_TRACE.eccentricDiameterMm, 1.2, [side + PLATE_PRINTED.heightMm / 2 + 1, 0, pc + CT_TRACE.plateRidgeLengthMm / 2 + 0.6]),
];
/** Головка самореза планки — сферический сегмент на оси X. */
const screwHead = (d: number, h: number, at: [number, number, number]) => {
  const rad = (d * d) / (8 * h) + h / 2;
  const g = new THREE.SphereGeometry(rad, 24, 8, 0, Math.PI * 2, 0, Math.acos((rad - h) / rad));
  g.translate(0, -(rad - h), 0);
  g.rotateZ(-Math.PI / 2);
  g.translate(at[0], at[1], at[2]);
  return g;
};
const plateScrews = plateHoleZMm().map((z) => screwHead(CT_TRACE.plateScrewHeadDiameterMm, CT_TRACE.plateScrewHeadHeightMm, [side + CT_TRACE.plateBaseMm, 0, z]));

/** Узлы файла: имя, материал, сетка — их же меряет приёмка (TW11). */
export const CLIP_TOP_PARTS: GlbPart[] = [
  { name: 'cup', material: NICKEL, mesh: merge(cupParts) },
  { name: 'flange', material: NICKEL, mesh: merge([flange]) },
  { name: 'cup-screws', material: ZINC, mesh: merge(cupScrews) },
  { name: 'cup-pins', material: NICKEL, mesh: merge(cupPins) },
  { name: 'arm', material: NICKEL, mesh: merge(arm) },
  { name: 'arm-head', material: NICKEL, mesh: merge(armHead) },
  { name: 'damper', material: DAMPER, mesh: merge(damper) },
  { name: 'mounting-plate', material: NICKEL, mesh: merge(plate) },
  { name: 'plate-screws', material: ZINC, mesh: merge(plateScrews) },
];
export const CLIP_TOP_ROLES = { moving: ['cup', 'flange', 'cup-screws', 'cup-pins'], fixed: ['arm', 'arm-head', 'damper', 'mounting-plate', 'plate-screws'] };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) throw new Error('нужна папка для .glb');
  mkdirSync(dir, { recursive: true });
  const made = writeGlb(
    join(dir, 'blum-clip-top-71B3550-175H3130.glb'),
    CLIP_TOP_PARTS,
    'ALDIK Studio — визуальная реконструкция Blum CLIP top BLUMOTION 71B3550 + планка 175H3130 по чертежам каталога 2024-2025 (pdf 81, 154, 724), не CAD производителя',
  );
  process.stdout.write(JSON.stringify({ hinge: made, roles: CLIP_TOP_ROLES, armBottom, armTop, r }));
}
