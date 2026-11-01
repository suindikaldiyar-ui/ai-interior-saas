/**
 * ТЕСТОВЫЙ ФАЙЛ ПРИЁМКИ РЕЕСТРА 3D (ТЗ 2026-10-31, § 4) — не CAD производителя.
 *
 * GLB петли Blum 71B3550 из СОБСТВЕННОЙ реконструкции ALDIK Studio
 * (`hingeHalfMesh`: чашка Ø35 × 13 и фланец FLB 57 — по паспорту, плечо —
 * условное): две части — `cup` (едет с фасадом) и `arm` (стоит на боковине),
 * миллиметры, ось Y вверх, монтажная точка (ось чашки на тыле фасада) — в
 * начале координат. В реестре он идёт как VISUAL_RECONSTRUCTION с источником
 * «собственная реконструкция»: приёмка проверяет путь импорта и сцены, а не
 * выдаёт свою геометрию за геометрию производителя.
 *
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/twin-test-asset.ts <путь.glb>`
 * Выход — путь файла и его габарит (JSON в stdout).
 */
import { writeFileSync } from 'node:fs';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { hingeModelOf } from '../lib/millwork/hingeModel';
import { hingeHalfMesh, meshBounds, type MeshData } from '../lib/millwork/hingeMeshData';
import type { CatalogEntryFull } from '../types/catalog';

const out = process.argv[2];
if (!out) throw new Error('нужен путь выходного .glb');
const facts = HARDWARE_FACTS.filter((f) => f.article === 'MFR-BLUM-71B3550' || f.article === 'MFR-BLUM-175H3130');
const catalog = hardwareCatalog(
  facts.map((fact) => {
    const row = hardwareCatalogRow(fact);
    return { id: `hw:${fact.article}`, article: row.article, name_ru: row.name_ru, price: 0, unit: row.unit, meta: { hardware: fact.hardware }, is_active: true, assets: [] } as unknown as CatalogEntryFull;
  }),
);
const hinge = catalog.get('hw:MFR-BLUM-71B3550');
const plate = catalog.get('hw:MFR-BLUM-175H3130');
if (!hinge || !plate) throw new Error('позиций 71B3550 / 175H3130 в фактах нет');
const model = hingeModelOf(hinge, plate);
/* Внутренняя плоскость боковины — 21,5 мм от оси чашки у створки 450 на школе 16/4 (HG2). */
const SIDE_INNER_MM = -21.5;
const parts: { name: string; mesh: MeshData }[] = [
  { name: 'cup', mesh: hingeHalfMesh(model, 'cup', SIDE_INNER_MM, false, true, false) },
  { name: 'arm', mesh: hingeHalfMesh(model, 'arm', SIDE_INNER_MM, false, true, false) },
];

/* ── минимальный glTF 2.0 binary: буфер, виды, аксессоры, сетки, узлы ── */
const chunks: Buffer[] = [];
let offset = 0;
const bufferViews: object[] = [];
const accessors: object[] = [];
const meshes: object[] = [];
const nodes: object[] = [];
const push = (data: Buffer, target: number) => {
  const pad = (4 - (data.length % 4)) % 4;
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target });
  chunks.push(data, Buffer.alloc(pad));
  offset += data.length + pad;
  return bufferViews.length - 1;
};
for (const { name, mesh } of parts) {
  const b = meshBounds(mesh);
  const pos = Buffer.from(new Float32Array(mesh.positions).buffer);
  const nor = Buffer.from(new Float32Array(mesh.normals).buffer);
  const idx = Buffer.from(new Uint32Array(mesh.indices).buffer);
  const vp = push(pos, 34962);
  const vn = push(nor, 34962);
  const vi = push(idx, 34963);
  const count = mesh.positions.length / 3;
  accessors.push({ bufferView: vp, componentType: 5126, count, type: 'VEC3', min: b.min, max: b.max });
  accessors.push({ bufferView: vn, componentType: 5126, count, type: 'VEC3' });
  accessors.push({ bufferView: vi, componentType: 5125, count: mesh.indices.length, type: 'SCALAR' });
  const a = accessors.length - 3;
  meshes.push({ name, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: 0 }] });
  nodes.push({ name, mesh: meshes.length - 1 });
}
const bin = Buffer.concat(chunks);
const gltf = {
  asset: { version: '2.0', generator: 'ALDIK Studio — тестовая реконструкция петли 71B3550 (не CAD производителя)' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes,
  materials: [{ name: 'metal', pbrMetallicRoughness: { baseColorFactor: [0.78, 0.77, 0.74, 1], metallicFactor: 1, roughnessFactor: 0.3 } }],
  accessors,
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};
const json = Buffer.from(JSON.stringify(gltf));
const jsonPad = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonPad.length + 8 + bin.length, 8);
const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(jsonPad.length, 0);
jsonHead.writeUInt32LE(0x4e4f534a, 4);
const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(bin.length, 0);
binHead.writeUInt32LE(0x004e4942, 4);
writeFileSync(out, Buffer.concat([header, jsonHead, jsonPad, binHead, bin]));
const all = parts.map((p) => meshBounds(p.mesh));
const min = [0, 1, 2].map((k) => Math.min(...all.map((b) => b.min[k])));
const max = [0, 1, 2].map((k) => Math.max(...all.map((b) => b.max[k])));
process.stdout.write(JSON.stringify({ path: out, min, max, size: max.map((v, k) => Math.round((v - min[k]) * 10) / 10) }));
