/**
 * МИНИМАЛЬНЫЙ glTF 2.0 BINARY ДЛЯ РЕКОНСТРУКЦИЙ РЕЕСТРА 3D — одна запись на
 * узел: имя, сетка (позиции и нормали), материал PBR. Без three в выходе: файл
 * читают «Импорт CAD-фурнитуры» и GLTFLoader сцены. Общий для
 * `twin-tandembox-asset.ts` и `twin-hinge-asset.ts`.
 */
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';

export type GlbMaterial = { name: string; color: [number, number, number]; metallic: number; roughness: number };
export type GlbMesh = { positions: Float32Array; normals: Float32Array };
export type GlbPart = { name: string; material: GlbMaterial; mesh: GlbMesh };

/** Сетки three → одна сетка узла: без индексов, нормали по граням (острые рёбра металла). */
export function merge(list: THREE.BufferGeometry[]): GlbMesh {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = flat.reduce((s, g) => s + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let at = 0;
  for (const g of flat) {
    g.computeVertexNormals();
    pos.set(g.getAttribute('position').array as Float32Array, at * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, at * 3);
    at += g.getAttribute('position').count;
  }
  return { positions: pos, normals: nor };
}

export function writeGlb(path: string, parts: GlbPart[], generator: string) {
  const chunks: Buffer[] = [];
  let offset = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const meshes: object[] = [];
  const nodes: object[] = [];
  const materials: GlbMaterial[] = [];
  const push = (data: Buffer, target: number) => {
    const pad = (4 - (data.length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target });
    chunks.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
    return bufferViews.length - 1;
  };
  for (const part of parts) {
    const p = part.mesh.positions;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
    const count = p.length / 3;
    const vp = push(Buffer.from(p.buffer, p.byteOffset, p.byteLength), 34962);
    const vn = push(Buffer.from(part.mesh.normals.buffer, part.mesh.normals.byteOffset, part.mesh.normals.byteLength), 34962);
    accessors.push({ bufferView: vp, componentType: 5126, count, type: 'VEC3', min, max });
    accessors.push({ bufferView: vn, componentType: 5126, count, type: 'VEC3' });
    let m = materials.indexOf(part.material);
    if (m < 0) m = materials.push(part.material) - 1;
    meshes.push({ name: part.name, primitives: [{ attributes: { POSITION: accessors.length - 2, NORMAL: accessors.length - 1 }, material: m }] });
    nodes.push({ name: part.name, mesh: meshes.length - 1 });
  }
  const bin = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: materials.map((mat) => ({ name: mat.name, pbrMetallicRoughness: { baseColorFactor: [...mat.color, 1], metallicFactor: mat.metallic, roughnessFactor: mat.roughness } })),
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
  writeFileSync(path, Buffer.concat([header, jsonHead, jsonPad, binHead, bin]));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const p = part.mesh.positions;
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  }
  return { path, nodes: parts.map((part) => part.name), min, max, size: max.map((v, k) => Math.round((v - min[k]) * 10) / 10) };
}
