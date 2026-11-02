/**
 * GLB TANDEMBOX antaro M — ВИЗУАЛЬНАЯ РЕКОНСТРУКЦИЯ ПО ЧЕРТЕЖУ BLUM (не CAD производителя).
 *
 * Геометрия — `lib/millwork/tandemboxAntaro.ts` (напечатанное отдельно от снятого
 * с чертежа). Два файла на NL 450:
 *   царга 378M4502SA — узел `side-profile` (едет с ящиком);
 *   ходовая 576.4501M / 578.4501M — `cabinet-member` и `mount-screws` (стоят на
 *   корпусе), `carriage` и `rollers` — каретка с роликами между корпусным
 *   профилем и профилем царги (сечение pdf 301): идёт на половину хода ящика.
 * Оси — мм, Y вверх, начало — кромка и низ дна у передней кромки, левая сторона.
 * Импортируются тем же «Импортом CAD-фурнитуры», что и любой файл.
 *
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/twin-tandembox-asset.ts <папка>`
 * Выход — JSON: файлы, габариты, узлы.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { TB_PRINTED, TB_ROLLERS, TB_SCREW_HEAD, TB_TRACE, cabinetMemberOutline, carriageOutline, sideOutline, type Outline } from '../lib/millwork/tandemboxAntaro';
import { merge, writeGlb, type GlbMaterial } from './twin-glb';

const dir = process.argv[2];
if (!dir) throw new Error('нужна папка для .glb');
mkdirSync(dir, { recursive: true });
const NL = 450;

type Material = GlbMaterial;
/* Царга — сталь с порошковой краской: краска — диэлектрик (metallic 0), иначе без карты окружения сцены царга чернеет. Цвет исполнения не определён — светло-серый. */
const PAINTED: Material = { name: 'powder-coated-steel', color: [0.84, 0.85, 0.85], metallic: 0, roughness: 0.5 };
const ZINC: Material = { name: 'zinc-steel', color: [0.7, 0.71, 0.72], metallic: 1, roughness: 0.32 };
const PLASTIC: Material = { name: 'roller-plastic', color: [0.22, 0.22, 0.24], metallic: 0, roughness: 0.6 };

const shapeOf = (points: Outline, hole?: Outline) => {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  if (hole) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
};
/** Профиль вдоль хода: от передней кромки (Z = 0) назад на длину. */
const extrude = (shape: THREE.Shape, lengthMm: number) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth: lengthMm, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -lengthMm);
  return g;
};
/** Цилиндр с осью вдоль X — ролики и головки саморезов. */
const cylinderX = (diameterMm: number, widthMm: number, at: [number, number, number]) => {
  const g = new THREE.CylinderGeometry(diameterMm / 2, diameterMm / 2, widthMm, 20, 1, false);
  g.rotateZ(Math.PI / 2);
  g.translate(at[0], at[1], at[2]);
  return g;
};
const GENERATOR = 'ALDIK Studio — визуальная реконструкция TANDEMBOX antaro M по чертежу Blum (каталог 2024-2025, pdf 301), не CAD производителя';

const side = writeGlb(join(dir, `tandembox-antaro-M-side-nl${NL}.glb`), [{ name: 'side-profile', material: PAINTED, mesh: merge([extrude(shapeOf(sideOutline()), NL)]) }], GENERATOR);

const dm = carriageOutline();
const rollerZ = [-TB_ROLLERS.fromEndsMm, -(NL - TB_ROLLERS.fromEndsMm)];
const wall = -TB_PRINTED.carcassToBottomEdgeMm;
const runner = writeGlb(
  join(dir, `tandembox-antaro-runner-nl${NL}.glb`),
  [
    { name: 'cabinet-member', material: ZINC, mesh: merge([extrude(shapeOf(cabinetMemberOutline()), NL)]) },
    {
      name: 'mount-screws',
      material: ZINC,
      mesh: merge(TB_PRINTED.runnerScrewsNl450Mm.map((z) => cylinderX(TB_SCREW_HEAD.diameterMm, TB_SCREW_HEAD.heightMm, [wall + 1.6 + TB_SCREW_HEAD.heightMm / 2, TB_TRACE.screwAxisMm, -z]))),
    },
    { name: 'carriage', material: ZINC, mesh: merge([extrude(shapeOf(dm.outer, dm.hole), NL)]) },
    { name: 'rollers', material: PLASTIC, mesh: merge(rollerZ.map((z) => cylinderX(TB_ROLLERS.diameterMm, TB_ROLLERS.widthMm, [TB_ROLLERS.xMm, TB_ROLLERS.yMm, z]))) },
  ],
  GENERATOR,
);
process.stdout.write(JSON.stringify({ side, runner }));
