/**
 * ПРИЁМКА ПЕТЛИ В 3D (HW-03). Входит в `npm run test:hardware`.
 *
 * Путь экрана: та же кухня, что у присадки (`verify-drilling`), — петля Blum
 * 71B3550 и планка 173L8130 на дверце `base-1200@w1`, правила цеха присадки.
 * Сцена — `runBoxes`, сетка — `hingeHalfMesh`, ход звеньев — `linkPose`.
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull, type HardwareItem, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf, wallSegments } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { drillingPlan } from '../lib/millwork/drillingPlan';
import { closedFrontRect, leafPoses, runBoxes, runPlaces } from '../lib/millwork/cabinetBoxes';
import { LIFT_WORDS, liftMotionOf, liftPlace, liftPose } from '../lib/millwork/liftKinematics';
import { hingeHalfMesh, linkPose, meshBounds, type MeshData } from '../lib/millwork/hingeMeshData';
import { hingeModelOf, hingeParts } from '../lib/millwork/hingeModel';
import { HINGE_IMAGE_EDGE_MM } from '../lib/millwork/hingePlace';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
const own: Check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

const CATALOG = hardwareCatalog(
  HARDWARE_FACTS.map((fact) => {
    const row = hardwareCatalogRow(fact);
    return {
      id: `hw:${fact.article}`, org_id: 'org-3d', category_id: 'cat', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '',
      price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: { hardware: fact.hardware }, is_active: true, assets: [],
    } as unknown as CatalogEntryFull;
  }),
);
const item = (a: string): HardwareItem => {
  const found = CATALOG.get(`hw:${a}`);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${a} в фактах нет`);
  return found;
};
const DOOR = 'base-1200@w1';
const SHOP: ProductionSettings = {
  ...DEFAULT_PRODUCTION,
  drilling: {
    hingeEdgeMm: 100, hingeCount: [{ upToMm: 900, hinges: 2 }], plateOnCupAxis: true, handleHoleMm: 5, handlePlaceConfirmed: true,
    shelfSupport: null, confirmat: null, minRemainMm: 3, confirmed: true,
  },
};

function kitchen(production: ProductionSettings, ops: MillworkOp[]) {
  const base = workspaceInput({ title: 'HW-03', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!;
  if (ops.length > 0) {
    const next = applyOps({ run: shown().run, requirements: DEMO_REQUIREMENTS, ops, openings: input.openings, hardware: CATALOG });
    if (next.warnings.length > 0) throw new Error(next.warnings.join(' | '));
    edited = { optimal: next };
  }
  return { run: shown().run, input };
}

/** Каждый треугольник смотрит наружу: нормаль грани по обходу — в ту же сторону, что нормаль вершин. */
function outward(mesh: MeshData): { bad: number; total: number } {
  let bad = 0;
  const p = mesh.positions;
  const n = mesh.normals;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
    const e1 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
    const e2 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const vn = [n[a * 3] + n[b * 3] + n[c * 3], n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1], n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2]];
    if (f[0] * vn[0] + f[1] * vn[1] + f[2] * vn[2] <= 0) bad += 1;
  }
  return { bad, total: mesh.indices.length / 3 };
}

const BLUM = [
  { op: 'set_fitting', moduleId: DOOR, slot: 'hinge', itemId: item('MFR-BLUM-71B3550').id },
  { op: 'set_fitting', moduleId: DOOR, slot: 'hinge_plate', itemId: item('MFR-BLUM-173L8130').id },
] as MillworkOp[];

export function hinge3dChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nHW-03: петля в 3D — модель по паспорту, место = присадка, звенья на ходу');

  const model = hingeModelOf(item('MFR-BLUM-71B3550'), item('MFR-BLUM-173L8130'));
  const meshes = (['cup', 'arm'] as const).flatMap((half) => [false, true].flatMap((mirror) => [false, true].map((links) => hingeHalfMesh(model, half, -7.5, mirror, true, links))));
  const faces = meshes.map(outward);
  check(
    'HG1 сетка петли: чашка Ø35 × 13 и фланец FLB 57 из паспорта 71B3550; планка 32 / 37 из 173L8130; у всех половин, сторон и звеньев треугольники смотрят наружу',
    model.cupDiameterMm === 35 && model.cupDepthMm === 13 && model.flangeWidthMm === 57 && model.plateSpacingMm === 32 && model.plateFromEdgeMm === 37 &&
      model.status === 'VISUAL_RECONSTRUCTION' && model.conditional.some((c) => c.includes('звенья')) &&
      faces.every((f) => f.bad === 0 && f.total > 0),
    `треугольников наизнанку ${faces.reduce((s, f) => s + f.bad, 0)} из ${faces.reduce((s, f) => s + f.total, 0)}`,
  );

  const { run, input } = kitchen(SHOP, BLUM);
  const boxes = runBoxes(run, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: CATALOG, production: SHOP });
  const cups = boxes.filter((b) => b.node === 'hinge' && b.part === `${DOOR}:door:0` && b.hinge);
  const arms = boxes.filter((b) => b.node === 'hinge-arm' && b.hinge && Math.abs(b.hinge.origin[0] - (cups[0]?.hinge?.origin[0] ?? NaN)) < 1e-9);
  const place = runPlaces(run).find((p) => p.unit.id === DOOR);
  if (!place || cups.length === 0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: петель дверцы в сцене нет');
  const plan = drillingPlan({ walls: panelWallsOf(null, wallSegments(null, run, {}), input.runWallId), production: SHOP, hardware: CATALOG });
  const door = plan.parts.find((p) => p.moduleId === DOOR && p.role === 'door' && p.leaf === 'door:0');
  if (!door) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: дверцы в плане присадки нет');
  const drilled = door.ops.filter((o) => o.role === 'hinge_cup');
  /*
   * Ось чашки в координатах НАРИСОВАННОЙ детали (F9): от левой кромки и низа
   * закрытого полотна. До F9 здесь стояла кромка «место + зазор/2» — у
   * одиночной створки её нет (деталь режется «ширина − 2 зазора», кромка на
   * зазор от края места), и петля стояла на 2 мм ближе к кромке, чем сверлит
   * присадка; ошибка проверки и ошибка сцены гасили друг друга.
   */
  const leafRect = closedFrontRect(boxes.filter((b) => b.part === `${DOOR}:door:0`));
  if (!leafRect) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: закрытого полотна дверцы в сцене нет');
  const doorLeft = leafRect.cx - leafRect.w / 2;
  const doorBottom = leafRect.cy - leafRect.h / 2;
  if (Math.abs(leafRect.h * 1000 - door.lengthMm) > 0.05 || Math.abs(leafRect.w * 1000 - door.widthMm) > 0.05) {
    throw new Error(`полотно сцены ${leafRect.w * 1000}×${leafRect.h * 1000} ≠ деталь присадки ${door.widthMm}×${door.lengthMm}`);
  }
  void place;
  const scene = cups.map((c) => [Math.round(((c.hinge!.origin[1] - doorBottom) * 1000) * 10) / 10, Math.round(((c.hinge!.origin[0] - doorLeft) * 1000) * 10) / 10]).sort((a, b) => a[0] - b[0]);
  const drill = drilled.map((o) => [o.xMm, o.yMm]).sort((a, b) => a[0] - b[0]);
  check(
    'HG2 петля в сцене стоит там, где её сверлит присадка: оси чашек по высоте 100 и 616, от кромки 21,5 (TB 4 + 17,5) — одна функция `hingePlace`; у каждой чашки своё плечо на боковине',
    JSON.stringify(scene) === JSON.stringify(drill) && cups.every((c) => c.hinge!.passport) && arms.length === cups.length,
    `сцена ${JSON.stringify(scene)} · присадка ${JSON.stringify(drill)}`,
  );

  /* Без выбранной петли — прежняя картинка узла: условные 22 мм и поровну по высоте, место не «паспортное». */
  const plain = kitchen(DEFAULT_PRODUCTION, []);
  const plainCups = runBoxes(plain.run, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4 }).filter((b) => b.node === 'hinge' && b.part === `${DOOR}:door:0`);
  /* От кромки нарисованной детали (F9), как у петли по паспорту, — а не от края места. */
  const plainLeaf = closedFrontRect(runBoxes(plain.run, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4 }).filter((b) => b.part === `${DOOR}:door:0`));
  if (!plainLeaf) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: закрытого полотна дверцы без петли производителя нет');
  const plainEdge = plainLeaf.cx - plainLeaf.w / 2;
  check(
    'HG3 без петли производителя — прежняя картинка: ось на условных 22 мм от кромки детали, поровну по высоте, помечена «не по паспорту»',
    plainCups.length === 2 &&
      plainCups.every((c) => Math.abs((c.position[0] - plainEdge) * 1000 - HINGE_IMAGE_EDGE_MM) < 1e-6 && c.hinge && !c.hinge.passport && c.hinge.model.status === 'VISUAL_APPROXIMATION'),
    plainCups.map((c) => `${((c.position[0] - plainEdge) * 1000).toFixed(1)}`).join(' / '),
  );

  /* Звенья на ходу: неподвижный конец на плече, подвижный едет с чашкой по дуге вокруг оси створки. */
  const draw = cups[0].hinge!;
  const links = hingeParts(draw.model, draw.sideInnerXMm).links;
  const sx = draw.mirror ? -1 : 1;
  const toRow = (p: [number, number, number]): [number, number, number] => [draw.origin[0] + (p[0] * sx) / 1000, draw.origin[1] + p[1] / 1000, draw.origin[2] + p[2] / 1000];
  const pivot: [number, number, number] = [place.x, 0, 0];
  const rot = (angle: number) => (p: [number, number, number]): [number, number, number] => {
    const lx = p[0] - pivot[0];
    const lz = p[2] - pivot[2];
    return [pivot[0] + lx * Math.cos(angle) + lz * Math.sin(angle), p[1], pivot[2] - lx * Math.sin(angle) + lz * Math.cos(angle)];
  };
  const closed = linkPose(toRow(links[0].fixed), toRow(links[0].moving), rot(0));
  const open = linkPose(toRow(links[0].fixed), toRow(links[0].moving), rot(-Math.PI / 2));
  const movingOpen = rot(-Math.PI / 2)(toRow(links[0].moving));
  const radius = (p: [number, number, number]) => Math.hypot(p[0] - pivot[0], p[2] - pivot[2]);
  check(
    'HG4 звено на ходу: при 0° концы — плечо и корпус шарнира в закрытой позе; при 90° неподвижный конец на месте, подвижный ушёл по дуге вокруг оси створки (радиус тот же), длина звена другая',
    Math.abs(closed.length * 1000 - Math.hypot(...[0, 1, 2].map((k) => (links[0].moving[k] - links[0].fixed[k]) * (k === 0 ? sx * sx : 1)))) < 1e-6 &&
      Math.abs(radius(movingOpen) - radius(toRow(links[0].moving))) < 1e-9 &&
      Math.abs(open.length - closed.length) > 1e-4,
    `закрыто ${(closed.length * 1000).toFixed(1)} мм · открыто ${(open.length * 1000).toFixed(1)} мм`,
  );

  /* Сетка петли — там, где её коробка: чашка в пределах ⌀ вокруг оси, плечо — на боковине. */
  const cupMesh = meshBounds(hingeHalfMesh(draw.model, 'cup', draw.sideInnerXMm, draw.mirror));
  const armMesh = meshBounds(hingeHalfMesh(draw.model, 'arm', draw.sideInnerXMm, draw.mirror));
  check(
    'HG5 сетка у своей коробки: чашка — от тыла фасада в фасад на глубину 13; планка — на внутренней плоскости боковины (x ≥ ' + draw.sideInnerXMm + ') и на 37 мм вглубь',
    Math.abs(cupMesh.max[2] - 13) < 1e-6 && armMesh.min[0] >= draw.sideInnerXMm - 1e-6 && armMesh.min[2] <= -37 && armMesh.max[2] <= 0,
    `чашка z ${cupMesh.min[2]}…${cupMesh.max[2]} · плечо x ${armMesh.min[0]}…${armMesh.max[0]}, z ${armMesh.min[2]}…${armMesh.max[2]}`,
  );

  /* ═════════════ HW-07: подъёмник — вид хода из класса механизма, одна поза на сцену и проверку ═════════════ */
  {
    const { run } = kitchen(SHOP, []);
    const upper = [...(run.upperSegments ?? []).flatMap((s) => s.modules)].find((m) => m.id === 'upper-1200@w1');
    if (!upper) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: модуля upper-1200@w1 в верхнем ряду нет');
    const withLift = (article: string) => ({ ...upper, fittings: [{ slot: 'lift' as const, itemId: item(article).id }] });
    const kinds = {
      hk: liftMotionOf(withLift('MFR-BLUM-22K2300'), CATALOG),
      hl: liftMotionOf(withLift('MFR-BLUM-22L2200'), CATALOG),
      hs: liftMotionOf(withLift('MFR-BLUM-22S2200'), CATALOG),
      hf: liftMotionOf(withLift('MFR-BLUM-22F2500'), CATALOG),
      none: liftMotionOf({ ...upper, fittings: [] }, CATALOG),
    };
    check(
      'LK1 вид хода — из класса механизма позиции на месте: HK top — поворот вверх, HL top — вертикальный подъём, HS top — вверх и назад над крышей, HF top — складной (ход не строится, словами); без позиции — нет',
      kinds.hk === 'swing_up' && kinds.hl === 'parallel_lift' && kinds.hs === 'swing_over' && kinds.hf === 'fold' && kinds.none === null && LIFT_WORDS.fold.includes('не построен'),
      JSON.stringify(kinds),
    );

    const h = 0.4;
    const t = 0.016;
    const top = liftPlace([0, 0, 0], liftPose('parallel_lift', 1, h, t), [0, -h, 0]);
    const bottomMid = liftPlace([0, 0, 0], liftPose('parallel_lift', 0.5, h, t), [0, -h, 0]);
    const overHalf = liftPose('swing_over', 0.5, h, t);
    const overEnd = liftPose('swing_over', 1, h, t);
    const overTop = liftPlace([0, 0, 0], overEnd, [0, 0, 0]);
    const swingEnd = liftPose('swing_up', 1, h, t);
    check(
      'LK2 поза: вертикальный — полотно не поворачивается, нижняя кромка поднимается на высоту фасада и выходит на толщину вперёд; «вверх и назад» — на половине хода поднят без наклона, в конце лёг назад над крышей; поворотный — 90° вверх',
      liftPose('parallel_lift', 1, h, t).angle === 0 &&
        Math.abs(top[1] - 0) < 1e-12 &&
        Math.abs(top[2] - t) < 1e-12 &&
        Math.abs(bottomMid[1] + h / 2) < 1e-12 &&
        overHalf.angle === 0 &&
        Math.abs(overHalf.liftY - h) < 1e-12 &&
        Math.abs(overEnd.angle + Math.PI / 2) < 1e-12 &&
        overTop[2] < -h + 1e-9 &&
        Math.abs(swingEnd.angle + Math.PI / 2) < 1e-12 &&
        swingEnd.liftY === 0,
      `HL: низ ${top.map((v) => v.toFixed(3)).join(', ')} · HS конец: верх ${overTop.map((v) => v.toFixed(3)).join(', ')}`,
    );

    /* Ход у угла и в сцене — та же поза: `leafPoses` с видом хода. */
    const closed = leafPoses({ opening: 'lift', x: 0, y: 1.45, width: 0.6, height: h, thickness: t, gap: 0.004, s: 0, lift: 'parallel_lift' });
    const open = leafPoses({ opening: 'lift', x: 0, y: 1.45, width: 0.6, height: h, thickness: t, gap: 0.004, s: 1, lift: 'parallel_lift' });
    const asSwing = leafPoses({ opening: 'lift', x: 0, y: 1.45, width: 0.6, height: h, thickness: t, gap: 0.004, s: 1 });
    const front = (list: typeof open) => list.find((b) => b.role === 'front')!;
    check(
      'LK3 проверка хода (`leafPoses`) — та же поза: вертикальный подъёмник в конце хода — полотно на высоту фасада выше закрытого, без наклона; без вида хода — прежний поворот вверх',
      Math.abs(front(open).center[1] - front(closed).center[1] - h) < 1e-9 &&
        (front(open).pitch ?? 0) === 0 &&
        Math.abs((front(asSwing).pitch ?? 0) - liftPose('swing_up', 1, h, t).angle) < 1e-9,
      `закрыт y ${front(closed).center[1].toFixed(3)} · открыт y ${front(open).center[1].toFixed(3)} · поворотный наклон ${(front(asSwing).pitch ?? 0).toFixed(3)}`,
    );
  }

  console.log(`\nHW-03 петли: ${passed} / ${failed}`);
  return { passed, failed };
}

if (require.main === module) {
  const r = hinge3dChecks();
  if (r.failed > 0) process.exit(1);
}
