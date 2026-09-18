/**
 * Приёмочная проверка пространственного соглашения.
 * Запуск: npm run test:spatial
 *
 * Здесь проверяется ровно то, что делает сцену защищённой от галлюцинаций
 * модели: правила высоты, зажим в стены с учётом поворота и расталкивание.
 */

import {
  clampToRoom,
  createItem,
  findHost,
  footprintRadius,
  overlaps,
  resolveCollisions,
} from '../lib/spatial';
import { DEFAULT_ROOM, type FurnitureItem, type RoomConfig } from '../types/interior';
import {
  buildComposition,
  cornerLostMm,
  runPlacements,
  tryBuildComposition,
  type RunPlacement,
} from '../lib/millwork/composition';
import { ceilingOverSpanMm } from '../lib/millwork/ceiling';
import type { Opening } from '../types/millwork';
import { buildRun } from '../lib/millwork/layout';
import type { Run } from '../types/millwork';
import { moduleBoxes, runBoxes, runPlaces } from '../lib/millwork/cabinetBoxes';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ElevationDrawing from '../components/millwork/ElevationDrawing';
import PlanDrawing from '../components/millwork/PlanDrawing';
import SectionDrawing from '../components/millwork/SectionDrawing';
import { axonometryBoxes } from '../lib/millwork/axonometry';
import { GEOMETRY } from '../lib/millwork/modules';
import { zoneProfile } from '../lib/millwork/zones';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import { mezzanineBaseOf, moduleDepthMm, rowStandardDepthMm } from '../lib/millwork/fill';
import { applyOps } from '../lib/millwork/ops';
import { buildPanels } from '../lib/millwork/panels';
import { wallMismatches } from '../lib/millwork/walls';
import { DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import type { CompositionKind, RunRequirements } from '../types/millwork';

const room: RoomConfig = { ...DEFAULT_ROOM }; // 6 × 5 × 2.9

let failed = 0;
let passed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
}

function near(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

console.log('\nПравила высоты');
{
  const rug = createItem('rug', { position: { x: 0, y: 1.5, z: 0 } }, room);
  check('ковёр всегда на Y = 0.01', near(rug.position.y, 0.01), `y=${rug.position.y}`);

  const sofa = createItem('sofa', { position: { x: 0, y: 0.9, z: 0 } }, room);
  check('диван всегда на Y = 0', near(sofa.position.y, 0), `y=${sofa.position.y}`);

  const pendant = createItem('pendant_lamp', { position: { x: 0, y: 0, z: 0 } }, room);
  check(
    'подвес всегда на Y = height комнаты',
    near(pendant.position.y, room.height),
    `y=${pendant.position.y}`,
  );
}

console.log('\nЗажим в стены');
{
  const far = createItem('armchair', { position: { x: 99, y: 0, z: -99 } }, room);
  const r = footprintRadius(far.dimensions, far.rotation.y);
  check(
    'позиция (99, 0, -99) зажата внутрь комнаты',
    Math.abs(far.position.x) <= room.width / 2 - r.rx + 1e-6 &&
      Math.abs(far.position.z) <= room.depth / 2 - r.rz + 1e-6,
    `→ (${far.position.x}, ${far.position.z})`,
  );

  // Диван 2.2 × 0.95: по X он занимает 2.2 без поворота и 0.95 при 90°.
  const straight = createItem('sofa', { position: { x: 99, y: 0, z: 0 }, rotationY: 0 }, room);
  const turned = createItem('sofa', { position: { x: 99, y: 0, z: 0 }, rotationY: 90 }, room);
  check(
    'зажим учитывает реальную проекцию, а не ширину',
    turned.position.x > straight.position.x,
    `0° → x=${straight.position.x}, 90° → x=${turned.position.x}`,
  );
  // Правый край дивана не должен выйти за стену, но обязан встать вплотную (≤ 1 см зазора).
  const turnedEdge = turned.position.x + footprintRadius(turned.dimensions, 90).rx;
  check(
    'повёрнутый диван прижат к стене своей глубиной',
    turnedEdge <= room.width / 2 + 1e-9 && turnedEdge > room.width / 2 - 0.01,
    `x=${turned.position.x}, край=${turnedEdge.toFixed(3)} при стене ${room.width / 2}`,
  );

  // Прямая проверка clampToRoom на уже собранном объекте.
  const pushed = clampToRoom(
    { ...straight, position: { ...straight.position, z: -40 } },
    room,
  );
  check('clampToRoom не выпускает по Z', pushed.position.z >= -room.depth / 2, `z=${pushed.position.z}`);
}

console.log('\nПредмет на поверхности');
{
  const unit = createItem('tv_unit', { position: { x: 0, y: 0, z: -2.2 } }, room);
  const host = findHost({ x: 0, z: -2.2 }, [unit]);
  check('опорный предмет найден', host?.id === unit.id, host ? host.type : 'null');

  const tv = createItem('tv', { position: { x: 0, y: 0, z: -2.2 } }, room, host);
  check('ТВ на тумбе встаёт на Y = 0.45', near(tv.position.y, 0.45), `y=${tv.position.y}`);
}

console.log('\nСтолкновения');
{
  const a = createItem('armchair', { id: 'chair-a', position: { x: 0, y: 0, z: 0 } }, room);
  const b = createItem('armchair', { id: 'chair-b', position: { x: 0, y: 0, z: 0 } }, room);

  check('до расталкивания кресла пересекаются', overlaps(a, b, 0.04));

  const settled = resolveCollisions(b, [a], room);
  check(
    'после расталкивания пересечения нет',
    !overlaps(a, settled, 0.04),
    `(${settled.position.x}, ${settled.position.z})`,
  );

  const rug = createItem('rug', { position: { x: 0, y: 0, z: 0 } }, room);
  check('ковёр не пересекается с креслом', !overlaps(rug, a, 0.04));
  check('кресло не пересекается с ковром', !overlaps(a, rug, 0.04));

  const pendant = createItem('pendant_lamp', { position: { x: 0, y: 0, z: 0 } }, room);
  check('подвес не участвует в расталкивании', !overlaps(pendant, a, 0.04));

  // Расталкивание в толпе: пять кресел в одной точке должны разойтись.
  const crowd: FurnitureItem[] = [];
  for (let i = 0; i < 5; i++) {
    const item = createItem('armchair', { id: `crowd-${i}`, position: { x: 0.2, y: 0, z: 0.1 } }, room);
    crowd.push(resolveCollisions(item, crowd, room));
  }
  const anyOverlap = crowd.some((x, i) => crowd.slice(i + 1).some((y) => overlaps(x, y, 0.04)));
  check(
    'пять кресел в одной точке разошлись',
    !anyOverlap,
    crowd.map((c) => `(${c.position.x},${c.position.z})`).join(' '),
  );
}

/* ═════════════  Композиция в мировых координатах: угол и П  ═════════════ */

/**
 * УГЛОВАЯ И П-ОБРАЗНАЯ СОБИРАЮТСЯ В ОДНОЙ СИСТЕМЕ КООРДИНАТ.
 *
 * На одном ряду расхождение трансформа не видно: ряд один, и куда его ни
 * поставь, он выглядит правильно. На двух и трёх видно сразу — ряды не
 * стыкуются, между ними разрывы, часть мебели висит в воздухе.
 *
 * Поэтому проверка меряет МИРОВЫЕ числа: габарит каждого ряда, стык между
 * соседями и отметку низа корпуса. Скриншот канваса тут не доказывает
 * ничего — без `preserveDrawingBuffer` он приходит очищенным.
 *
 * Композиции собираются НАСТОЯЩИМ публичным путём — `buildComposition` и
 * `runPlacements`, те же вызовы, что делает рабочий экран.
 */
console.log('\nКомпозиция в мировых координатах');
{
  const DEPTH_MM = zoneProfile('kitchen').depthMm;
  const TOL_M = 0.001;

  type WorldRun = {
    label: string;
    place: RunPlacement;
    lengthMm: number;
    modules: number;
    /** Габарит в плане, метры. Высота проверяется отдельно. */
    aabb: { minX: number; maxX: number; minZ: number; maxZ: number };
    /** Точка НАЧАЛА ряда у стены и точка КОНЦА — в мировых метрах. */
    startAtWall: [number, number];
    endAtWall: [number, number];
    /** Низ корпуса каждого напольного модуля, мм от пола. */
    bottoms: number[];
  };

  /** Локальная точка ряда → мировая. Тот же поворот, что ставит сцену. */
  const toWorld = (place: RunPlacement, xM: number, zM: number): [number, number] => {
    const a = (place.rotationYDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return [xM * cos + zM * sin + place.xM, -xM * sin + zM * cos + place.zM];
  };

  const worldRuns = (
    kind: CompositionKind,
    wallsMm: number[],
  ): { runs: WorldRun[]; lostMm: number } => {
    const requirements: RunRequirements = DEMO_REQUIREMENTS;
    const solution = requirements.cornerSolution ?? 'false_panel';
    const lostMm = cornerLostMm(solution, DEPTH_MM);

    const segments =
      kind === 'linear'
        ? [
            {
              label: 'Стена А',
              run: buildRun({
                lengthMm: wallsMm[0],
                ceilingHeightMm: 2700,
                requirements,
                openings: [],
                comms: [],
              }),
            },
          ]
        : buildComposition({
            kind,
            walls: wallsMm.map((lengthMm, i) => ({ id: `w${i}`, lengthMm, openings: [] })),
            ceilingHeightMm: 2700,
            requirements,
            comms: [],
          }).segments;

    const places = runPlacements({
      runs: segments.map((segment) => segment.run),
      solution,
      zone: 'kitchen',
      production: DEFAULT_PRODUCTION,
    });

    return {
      lostMm,
      runs: segments.map((segment, i) => {
        const run = segment.run;
        const place = places[i];
        const depthM = DEPTH_MM / 1000;
        const lengthM = run.lengthMm / 1000;

        // Габарит ряда в плане: четыре угла прямоугольника, повёрнутые.
        const corners: [number, number][] = [
          toWorld(place, 0, 0),
          toWorld(place, lengthM, 0),
          toWorld(place, 0, -depthM),
          toWorld(place, lengthM, -depthM),
        ];
        const xs = corners.map((c) => c[0]);
        const zs = corners.map((c) => c[1]);

        const places3d = runPlaces(run);

        return {
          label: segment.label ?? `Стена ${i + 1}`,
          place,
          lengthMm: run.lengthMm,
          modules: run.modules.length,
          aabb: {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minZ: Math.min(...zs),
            maxZ: Math.max(...zs),
          },
          startAtWall: toWorld(place, 0, -depthM),
          endAtWall: toWorld(place, lengthM, -depthM),
          bottoms: places3d
            .filter((spot) => run.modules.some((unit) => unit.id === spot.unit.id))
            .map((spot) => Math.round(spot.y * 1000)),
        };
      }),
    };
  }

  /** Ширины модулей и объявленный остаток каждого ряда. */
  const runWidths = (kind: CompositionKind, wallsMm: number[]) => {
    const requirements: RunRequirements = DEMO_REQUIREMENTS;
    const segments =
      kind === 'linear'
        ? [
            buildRun({
              lengthMm: wallsMm[0],
              ceilingHeightMm: 2700,
              requirements,
              openings: [],
              comms: [],
            }),
          ]
        : buildComposition({
            kind,
            walls: wallsMm.map((lengthMm, i) => ({ id: `w${i}`, lengthMm, openings: [] })),
            ceilingHeightMm: 2700,
            requirements,
            comms: [],
          }).segments.map((segment) => segment.run);

    return segments.map((run) => ({
      sum: run.modules.reduce((total, unit) => total + unit.widthMm, 0),
      residual: run.residualMm,
    }));
  };

  const shapes: { title: string; kind: CompositionKind; walls: number[] }[] = [
    { title: 'прямая', kind: 'linear', walls: [3800] },
    { title: 'угловая', kind: 'corner_l', walls: [3800, 1140] },
    { title: 'П-образная', kind: 'u_shape', walls: [3800, 1140, 1740] },
  ];

  for (const shape of shapes) {
    const { runs, lostMm } = worldRuns(shape.kind, shape.walls);

    console.log(`\n  ${shape.title}: стены ${shape.walls.join(' + ')} мм`);
    console.log(
      '    рун      | начало X,Z м        | угол | длина мм | модулей',
    );
    for (const run of runs) {
      console.log(
        `    ${run.label.padEnd(8)} | ${run.startAtWall
          .map((v) => v.toFixed(3).padStart(7))
          .join(', ')} | ${String(run.place.rotationYDeg).padStart(4)} | ${String(
          run.lengthMm,
        ).padStart(8)} | ${String(run.modules).padStart(7)}`,
      );
    }

    /*
     * Ноль рядов или ряд без модулей — это НЕ «проверять нечего»: это
     * пустой экран у замерщика. Проверка обязана упасть здесь, а не
     * молча пройти по пустому списку.
     */
    check(
      `${shape.title}: рядов ${shape.walls.length}, и в каждом есть модули`,
      runs.length === shape.walls.length && runs.every((run) => run.modules > 0),
      runs.length === 0
        ? 'РЯДОВ НЕТ ВОВСЕ'
        : runs.map((r) => `${r.label}: ${r.modules} мод.`).join(' · '),
    );

    check(
      `${shape.title}: у каждого ряда есть мировой габарит`,
      runs.every(
        (run) => run.aabb.maxX - run.aabb.minX > 0.05 && run.aabb.maxZ - run.aabb.minZ > 0.05,
      ),
      runs
        .map(
          (r) =>
            `${r.label} x[${r.aabb.minX.toFixed(2)};${r.aabb.maxX.toFixed(2)}] ` +
            `z[${r.aabb.minZ.toFixed(2)};${r.aabb.maxZ.toFixed(2)}]`,
        )
        .join(' · '),
    );

    /* Два ряда в одном объёме — это мебель, которой нельзя собрать. */
    const overlaps: string[] = [];
    for (let i = 0; i < runs.length; i += 1) {
      for (let j = i + 1; j < runs.length; j += 1) {
        const a = runs[i].aabb;
        const b = runs[j].aabb;
        const dx = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const dz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (dx > TOL_M && dz > TOL_M) {
          overlaps.push(
            `${runs[i].label}×${runs[j].label}: ${Math.round(dx * 1000)}×${Math.round(
              dz * 1000,
            )} мм`,
          );
        }
      }
    }
    check(`${shape.title}: габариты рядов не пересекаются`, overlaps.length === 0, overlaps.join(' '));

    /*
     * СТЫК. Ряд Б начинается там, где кончается занятое рядом А: на
     * объявленные `lost` миллиметров дальше по своей стене. Больше —
     * между рядами дыра, меньше — они лезут друг на друга.
     */
    const joints: string[] = [];
    for (let i = 1; i < runs.length; i += 1) {
      const from = runs[i - 1].endAtWall;
      const to = runs[i].startAtWall;
      const gapMm = Math.hypot(to[0] - from[0], to[1] - from[1]) * 1000;
      const driftMm = Math.abs(gapMm - lostMm);
      joints.push(
        `${runs[i - 1].label}→${runs[i].label}: ${Math.round(gapMm)} мм при объявленных ${lostMm}`,
      );
      check(
        `${shape.title}: стык ${runs[i - 1].label} → ${runs[i].label} равен объявленному углу`,
        driftMm <= 1,
        `${joints[joints.length - 1]} (расхождение ${Math.round(driftMm)} мм)`,
      );
    }

    check(
      `${shape.title}: низ корпуса каждого модуля на цоколе`,
      runs.every((run) => run.bottoms.every((mm) => mm === GEOMETRY.base.plinthH)),
      runs
        .map((r) => `${r.label}: ${Array.from(new Set(r.bottoms)).join('/')}`)
        .join(' · '),
    );

    check(
      `${shape.title}: сумма ширин модулей сходится с полезной длиной`,
      runs.every((run, i) => {
        const segment = runWidths(shape.kind, shape.walls)[i];
        return Math.abs(segment.sum + segment.residual - run.lengthMm) <= 1;
      }),
      runWidths(shape.kind, shape.walls)
        .map((w) => `${w.sum}+${w.residual}`)
        .join(' · '),
    );
  }

}

/* ═════════════  П замыкается, и угол считается одной глубиной  ═════════════ */

/**
 * П-ОБРАЗНАЯ ЗАМЫКАЕТСЯ: СТЕНА В СТОИТ НАПРОТИВ СТЕНЫ А.
 *
 * Место рядов считается цепочкой от `run.lengthMm`. Ряд, собранный на
 * другой длине стены, сдвигал всё, что за ним: между стеной А и стеной В
 * открывалась пустота 680 мм, и П переставала быть П.
 *
 * И вторая, независимая расходимость: занятое в углу считалось из ДВУХ
 * глубин — школы цеха в раскладке и профиля зоны в сцене. На умолчаниях
 * обе давали 560, у цеха с 550 ряд уезжал на десять миллиметров.
 */
console.log('\nП замыкается, и угол считается одной глубиной');
{
  const TOL_M = 0.001;

  const shopA: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
    heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
  };

  const worldOf = (production: ProductionSettings) => {
    const layout = buildComposition({
      kind: 'u_shape',
      walls: [3800, 1140, 1740].map((lengthMm, i) => ({
        id: `w${i}`,
        lengthMm,
        openings: [],
      })),
      ceilingHeightMm: 2700,
      requirements: DEMO_REQUIREMENTS,
      comms: [],
      production,
    });

    const runs = layout.segments.map((segment) => segment.run);
    const places = runPlacements({
      runs,
      solution: DEMO_REQUIREMENTS.cornerSolution ?? 'false_panel',
      zone: 'kitchen',
      production,
    });

    const depthM = rowStandardDepthMm('kitchen', 'base', production) / 1000;
    const world = (i: number, xM: number, zM: number) => {
      const a = (places[i].rotationYDeg * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return [xM * cos + zM * sin + places[i].xM, -xM * sin + zM * cos + places[i].zM] as const;
    };

    const boxes = runs.map((run, i) => {
      const L = run.lengthMm / 1000;
      const pts = [world(i, 0, 0), world(i, L, 0), world(i, 0, -depthM), world(i, L, -depthM)];
      return {
        minX: Math.min(...pts.map((q) => q[0])),
        maxX: Math.max(...pts.map((q) => q[0])),
        minZ: Math.min(...pts.map((q) => q[1])),
        maxZ: Math.max(...pts.map((q) => q[1])),
      };
    });

    return { layout, runs, places, boxes, depthM, world };
  };

  for (const [name, production] of [
    ['умолчания (560)', DEFAULT_PRODUCTION],
    ['цех А (550)', shopA],
  ] as const) {
    const { layout, runs, boxes, depthM, world } = worldOf(production);

    /*
     * Ноль рядов — это не «проверять нечего», это пустой экран.
     * Падаем здесь, а не проходим по пустому списку.
     */
    check(
      `${name}: три ряда собрались`,
      runs.length === 3 && runs.every((run) => run.lengthMm > 0),
      runs.length === 0 ? 'РЯДОВ НЕТ ВОВСЕ' : runs.map((run) => run.lengthMm).join(' + '),
    );
    if (runs.length !== 3) continue;

    /* ── Занятое в углу одинаково в раскладке и в сцене ── */
    const declared = cornerLostMm(
      DEMO_REQUIREMENTS.cornerSolution ?? 'false_panel',
      rowStandardDepthMm('kitchen', 'base', production),
    );
    const fromLayout = layout.segments[1].wallLengthMm - layout.segments[1].run.lengthMm;

    check(
      `${name}: занятое в углу одно на раскладку и на сцену`,
      fromLayout === declared,
      `раскладка ${fromLayout} мм, сцена ${declared} мм`,
    );

    /* ── Стена В стоит НАПРОТИВ стены А, а не за 680 мм от неё ── */
    const aisleMm = Math.round((boxes[2].minZ - boxes[0].maxZ) * 1000);
    check(
      `${name}: П замыкается — проход между А и В, а не пустота`,
      aisleMm >= 0 && aisleMm < 100,
      `между А и В ${aisleMm} мм`,
    );

    /* ── Габариты не пересекаются, стыки сходятся ── */
    const overlaps: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const dx = Math.min(boxes[i].maxX, boxes[j].maxX) - Math.max(boxes[i].minX, boxes[j].minX);
        const dz = Math.min(boxes[i].maxZ, boxes[j].maxZ) - Math.max(boxes[i].minZ, boxes[j].minZ);
        if (dx > TOL_M && dz > TOL_M) overlaps.push(`${i}×${j}`);
      }
    }
    check(`${name}: габариты рядов не пересекаются`, overlaps.length === 0, overlaps.join(' '));

    const joints: string[] = [];
    for (let i = 1; i < runs.length; i += 1) {
      const from = world(i - 1, runs[i - 1].lengthMm / 1000, -depthM);
      const to = world(i, 0, -depthM);
      const gapMm = Math.hypot(to[0] - from[0], to[1] - from[1]) * 1000;
      if (Math.abs(gapMm - declared) > 1) {
        joints.push(`${i - 1}→${i}: ${Math.round(gapMm)} при ${declared}`);
      }
    }
    check(`${name}: стыки сходятся с объявленным углом до 1 мм`, joints.length === 0, joints.join(' '));
  }

  /*
   * И то же самое числом: ряд, собранный на другой длине, расхождение
   * ПОКАЗЫВАЕТ, а не встаёт молча.
   */
  const { layout, runs } = worldOf(DEFAULT_PRODUCTION);
  const stale = buildRun({
    lengthMm: 1140,
    ceilingHeightMm: 2700,
    requirements: DEMO_REQUIREMENTS,
    openings: [],
    comms: [],
  });

  const found = wallMismatches(layout, [runs[0], stale, runs[2]]);

  check(
    'ряд, собранный на 1140 при стене 480, не проходит молча',
    found.length === 1,
    found.map((m) => `${m.label}: ${m.runLengthMm} при ${m.usableMm}`).join(' ') ||
      'РАСХОЖДЕНИЕ НЕ НАЙДЕНО',
  );

  /*
   * И число из сообщения на экране — это НЕ фигура речи, а та самая
   * пустота в сцене: «сдвинет соседний ряд на 660 мм» означает, что
   * между стеной А и стеной В станет 20 + 660 = 680 мм.
   */
  const aisleOf = (rs: Pick<Run, 'lengthMm'>[]) => {
    const places = runPlacements({
      runs: rs,
      solution: DEMO_REQUIREMENTS.cornerSolution ?? 'false_panel',
      zone: 'kitchen',
      production: DEFAULT_PRODUCTION,
    });
    const depthM = rowStandardDepthMm('kitchen', 'base', DEFAULT_PRODUCTION) / 1000;

    /* Ряд занимает по Z полосу от фасада (z места) до задней стенки. */
    const band = (i: number) => {
      const back = places[i].zM - depthM * Math.cos((places[i].rotationYDeg * Math.PI) / 180);
      return [Math.min(places[i].zM, back), Math.max(places[i].zM, back)] as const;
    };

    return Math.round((band(2)[0] - band(0)[1]) * 1000);
  };

  const good = aisleOf(runs);
  const broken = aisleOf([runs[0], stale, runs[2]]);

  check(
    'сдвиг из сообщения — это и есть пустота в сцене',
    found.length === 1 && broken - good === Math.abs(found[0].runLengthMm - found[0].usableMm),
    `было бы ${broken} мм вместо ${good} мм — сдвиг ${broken - good} мм`,
  );
}

/* ══════════════  Задняя плоскость каждого ряда лежит на стене  ══════════════ */

/**
 * МЕБЕЛЬ СТОИТ У СТЕНЫ, А НЕ ВИСИТ ЗАПОДЛИЦО С ФАСАДОМ.
 *
 * Ряд рисуется от ФАСАДА: локальный ноль по z — передняя плоскость, и
 * корпус уходит в минус на свою глубину. Пока глубина у всех была одна,
 * это совпадало с правдой; на верхнем ряду разошлось — мельче становился
 * не перёд, а ЗАД, и верхние шкафы висели в 240 мм от стены, выровненные
 * по фасаду с нижними.
 *
 * Разрез и план всё это время рисовали от стены. Расходилась не мебель,
 * а сцена с чертежом — и на экране это читалось как «левая часть
 * выступает вперёд».
 *
 * Здесь меряется то, что видно: где задняя и передняя плоскость каждого
 * вида модуля относительно СВОЕЙ стены.
 */
console.log('\nЗадняя плоскость каждого ряда лежит на стене');
{
  const shopA: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
    heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
  };

  for (const [shopName, production] of [
    ['цех 560/320', DEFAULT_PRODUCTION],
    ['цех 550/350', shopA],
  ] as const) {
    const layout = buildComposition({
      kind: 'corner_l',
      walls: [
        { id: 'w1', lengthMm: 3800, openings: [] },
        { id: 'w2', lengthMm: 1800, openings: [] },
      ],
      ceilingHeightMm: 2700,
      requirements: DEMO_REQUIREMENTS,
      comms: [],
      production,
    });

    /* Антресоль: четвёртая глубина в том же ряду. */
    const runs = layout.segments.map((segment, i) =>
      i === 0
        ? applyOps({
            run: segment.run,
            requirements: { ...DEMO_REQUIREMENTS, cornerSolution: 'false_panel' },
            ops: [{ op: 'set_mezzanine', heightMm: 400 }],
            openings: [],
          })
        : segment.run,
    );

    const places = runPlacements({
      runs,
      solution: 'false_panel',
      zone: 'kitchen',
      production,
    });

    /*
     * Ноль рядов — это пустая сцена, а не «проверять нечего».
     * Падаем здесь, а не проходим по пустому списку.
     */
    check(
      `${shopName}: ряды для замера есть`,
      runs.length === 2 && runs.every((run) => run.modules.length > 0),
      runs.length === 0
        ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РЯДОВ — мерить нечего'
        : runs.map((run) => `${run.lengthMm} мм, ${run.modules.length} мод.`).join(' · '),
    );
    if (runs.length !== 2 || runs.some((run) => run.modules.length === 0)) continue;

    const rowDepthMm = rowStandardDepthMm('kitchen', 'base', production);

    runs.forEach((run, i) => {
      const place = places[i];
      const a = (place.rotationYDeg * Math.PI) / 180;
      /* Нормаль фасада ряда в мировых осях: на стене Б глубина идёт по x. */
      const normal: [number, number] = [Math.sin(a), Math.cos(a)];
      /* Стена ряда — на глубину НАЗАД от плоскости места. */
      const wall: [number, number] = [
        place.xM - (rowDepthMm / 1000) * normal[0],
        place.zM - (rowDepthMm / 1000) * normal[1],
      ];

      /** Отступ точки от СВОЕЙ стены вдоль нормали ряда, мм. */
      const fromWall = (localZ: number) =>
        Math.round(
          ((place.xM + localZ * normal[0] - wall[0]) * normal[0] +
            (place.zM + localZ * normal[1] - wall[1]) * normal[1]) *
            1000,
        );

      const label = layout.segments[i].label;
      const seen = new Map<string, { depthMm: number; back: number; front: number }>();

      for (const entry of runPlaces(run)) {
        const kind =
          entry.unit.section === 'mezzanine'
            ? 'антресоль'
            : entry.unit.column || entry.unit.appliance
              ? 'колонна'
              : entry.unit.kind === 'upper' || entry.unit.kind === 'corner_upper'
                ? 'верхний'
                : 'нижний';
        if (seen.has(kind)) continue;

        seen.set(kind, {
          depthMm: Math.round(entry.depthM * 1000),
          back: fromWall(entry.zM - entry.depthM),
          front: fromWall(entry.zM),
        });
      }

      const rows = Array.from(seen.entries());

      /* ── Задние плоскости — все на стене ── */
      const offWall = rows.filter(([, v]) => v.back !== 0);
      check(
        `${shopName} · ${label}: зад каждого ряда на стене`,
        rows.length >= 3 && offWall.length === 0,
        rows.length < 3
          ? `ВИДОВ МОДУЛЕЙ ВСЕГО ${rows.length}`
          : offWall.length > 0
            ? offWall.map(([k, v]) => `${k} висит в ${v.back} мм от стены`).join(' · ')
            : rows.map(([k, v]) => `${k} ${v.depthMm}`).join(' · '),
      );

      /* ── Передние плоскости разные, ровно на разницу глубин ── */
      const wrongFront = rows.filter(([, v]) => v.front !== v.depthMm);
      check(
        `${shopName} · ${label}: перёд уведён ровно на глубину`,
        wrongFront.length === 0,
        wrongFront.length > 0
          ? wrongFront.map(([k, v]) => `${k}: перёд ${v.front} при глубине ${v.depthMm}`).join(' · ')
          : rows.map(([k, v]) => `${k} ${v.front}`).join(' · '),
      );

      const upper = seen.get('верхний');
      const base = seen.get('нижний');
      if (upper && base) {
        check(
          `${shopName} · ${label}: верхний ряд мельче нижнего, и это видно спереди`,
          base.front - upper.front === base.depthMm - upper.depthMm &&
            base.front > upper.front,
          `нижний ${base.depthMm} → перёд ${base.front}, верхний ${upper.depthMm} → перёд ${upper.front}`,
        );
      }

      /* ── Чертёж и план считают те же миллиметры ── */
      const drift: string[] = [];
      for (const entry of runPlaces(run)) {
        /* План рисует прямоугольник от стены высотой `moduleDepthMm`. */
        const onPlan = moduleDepthMm(entry.unit, run.zone, run.production);
        if (Math.round(entry.depthM * 1000) !== onPlan) {
          drift.push(`${entry.unit.id}: сцена ${Math.round(entry.depthM * 1000)}, план ${onPlan}`);
        }
      }
      /* Разрез рисует ряды от стены своими глубинами школы цеха. */
      const sectionBase = rowStandardDepthMm(run.zone, 'base', run.production);
      const sectionUpper = rowStandardDepthMm(run.zone, 'upper', run.production);
      if (base && base.depthMm !== sectionBase) {
        drift.push(`нижний: сцена ${base.depthMm}, разрез ${sectionBase}`);
      }
      if (upper && upper.depthMm !== sectionUpper) {
        drift.push(`верхний: сцена ${upper.depthMm}, разрез ${sectionUpper}`);
      }

      check(
        `${shopName} · ${label}: сцена, план и разрез сходятся до миллиметра`,
        drift.length === 0,
        drift.join(' · ') || `нижний ${sectionBase} · верхний ${sectionUpper}`,
      );
    });
  }
}

/* ═══════════════  Композиция под ригелем не рассыпается  ═══════════════ */

/**
 * РИГЕЛЬ НЕ ЛОМАЕТ КОМПОЗИЦИЮ.
 *
 * Выступ на потолке меняет высоты, а не места: ряды стоят там же, габариты
 * не пересекаются, и ответа ровно два — собралась либо отказ словами.
 * Третьего (молчаливой пустоты, ряда без модулей, корпуса нулевой высоты)
 * быть не должно.
 */
console.log('\nКомпозиция под ригелем не рассыпается');
{
  const TOL_M = 0.001;

  const shopA: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
    heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
  };

  const beam = (fromCornerMm: number, widthMm: number, dropMm: number): Opening => ({
    id: `b-${fromCornerMm}-${widthMm}-${dropMm}`,
    kind: 'beam',
    fromCornerMm,
    widthMm,
    sillMm: 0,
    heightMm: dropMm,
  });

  const PLACES: [string, Opening][] = [
    ['у края', beam(0, 600, 300)],
    ['посередине', beam(1600, 600, 300)],
    ['на стыке модулей', beam(1200, 600, 300)],
    ['над колонной прибора', beam(0, 1200, 600)],
  ];

  for (const [shopName, production] of [
    ['цех 560/320', DEFAULT_PRODUCTION],
    ['цех 550/350', shopA],
  ] as const) {
    for (const [where, b] of PLACES) {
      const attempt = tryBuildComposition({
        kind: 'u_shape',
        walls: [
          { id: 'w1', lengthMm: 3800, openings: [b] },
          { id: 'w2', lengthMm: 1800, openings: [] },
          { id: 'w3', lengthMm: 1740, openings: [b] },
        ],
        ceilingHeightMm: 2700,
        requirements: DEMO_REQUIREMENTS,
        comms: [],
        production,
      });

      /* ── Ответа два: собралась либо отказ СЛОВАМИ ── */
      check(
        `${shopName} · ${where}: композиция собралась либо отказала словами`,
        attempt.state === 'built' ||
          (attempt.state === 'refused' && attempt.reason.trim().length > 20),
        attempt.state === 'refused' ? `отказ: ${attempt.reason.slice(0, 90)}` : 'собралась',
      );

      if (attempt.state !== 'built') continue;

      const runs = attempt.composition.segments.map((segment) => segment.run);

      /*
       * Ноль модулей — это молчаливая пустота, то самое третье состояние.
       * Падаем здесь, а не проходим по пустому списку.
       */
      const empty = runs.filter((run) => run.modules.length === 0);
      check(
        `${shopName} · ${where}: пустых рядов нет`,
        runs.length === 3 && empty.length === 0,
        runs.length === 0
          ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ РЯДОВ'
          : empty.length > 0
            ? `РЯДОВ БЕЗ МОДУЛЕЙ: ${empty.length}`
            : runs.map((run) => run.modules.length).join(' + '),
      );
      if (empty.length > 0) continue;

      /* ── Габариты рядов не пересекаются ── */
      const places = runPlacements({
        runs,
        solution: DEMO_REQUIREMENTS.cornerSolution ?? 'false_panel',
        zone: 'kitchen',
        production,
      });
      const depthM = rowStandardDepthMm('kitchen', 'base', production) / 1000;

      const boxes = runs.map((run, i) => {
        const a = (places[i].rotationYDeg * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const at = (x: number, z: number) =>
          [x * cos + z * sin + places[i].xM, -x * sin + z * cos + places[i].zM] as const;
        const L = run.lengthMm / 1000;
        const pts = [at(0, 0), at(L, 0), at(0, -depthM), at(L, -depthM)];
        return {
          minX: Math.min(...pts.map((q) => q[0])),
          maxX: Math.max(...pts.map((q) => q[0])),
          minZ: Math.min(...pts.map((q) => q[1])),
          maxZ: Math.max(...pts.map((q) => q[1])),
        };
      });

      const hits: string[] = [];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const dx = Math.min(boxes[i].maxX, boxes[j].maxX) - Math.max(boxes[i].minX, boxes[j].minX);
          const dz = Math.min(boxes[i].maxZ, boxes[j].maxZ) - Math.max(boxes[i].minZ, boxes[j].minZ);
          if (dx > TOL_M && dz > TOL_M) hits.push(`${i}×${j}`);
        }
      }

      check(
        `${shopName} · ${where}: габариты рядов не пересекаются`,
        hits.length === 0,
        hits.join(' ') || `мест ${places.length}`,
      );

      /* ── Высота модулей под ригелем не больше низа ригеля ── */
      const drift: string[] = [];
      runs.forEach((run, i) => {
        for (const entry of runPlaces(run)) {
          const ceiling = ceilingOverSpanMm(
            entry.unit.offsetMm,
            entry.unit.offsetMm + entry.unit.widthMm,
            run.beams,
            run.ceilingHeightMm,
          );
          const top = Math.round((entry.y + entry.heightM) * 1000);
          if (top > ceiling) drift.push(`ряд ${i} ${entry.unit.id}: верх ${top} при потолке ${ceiling}`);
        }
      });

      check(
        `${shopName} · ${where}: ни один модуль не заходит в ригель`,
        drift.length === 0,
        drift.join(' · ') || 'все под выступом',
      );
    }
  }
}

/* ═══════════  Между шкафом и ригелем в сцене нет щели  ═══════════ */

/**
 * ЗАЗОР МЕРЯЕТСЯ ТАМ, ГДЕ ЕГО ВИДНО.
 *
 * Высоту модуля считает `moduleCarcassHeightMm`, место по вертикали —
 * `runPlaces`. Сцена берёт оба числа; щель между верхом шкафа и низом
 * выступа — это их разность, и меряется она теми же местами, по которым
 * рисуется мебель.
 */
console.log('\nМежду шкафом и ригелем в сцене нет щели');
{
  const CEILING = 2700;

  const shopA: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
    heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
  };

  const beam = (fromCornerMm: number, widthMm: number, dropMm: number): Opening => ({
    id: `b-${fromCornerMm}-${widthMm}-${dropMm}`,
    kind: 'beam',
    fromCornerMm,
    widthMm,
    sillMm: 0,
    heightMm: dropMm,
  });

  for (const [shopName, production] of [
    ['цех 560/320', DEFAULT_PRODUCTION],
    ['цех 550/350', shopA],
  ] as const) {
    for (const drop of [200, 300, 500]) {
      const b = beam(1600, 600, drop);

      const layout = buildComposition({
        kind: 'corner_l',
        walls: [
          { id: 'w1', lengthMm: 3800, openings: [b] },
          { id: 'w2', lengthMm: 1800, openings: [] },
        ],
        ceilingHeightMm: CEILING,
        requirements: DEMO_REQUIREMENTS,
        comms: [],
        production,
      });

      const run = layout.segments[0].run;
      const bottomMm = CEILING - drop;

      const under = runPlaces(run)
        .filter(
          (entry) =>
            (entry.unit.kind === 'upper' || entry.unit.kind === 'corner_upper') &&
            entry.unit.section !== 'mezzanine',
        )
        .filter(
          (entry) =>
            entry.unit.offsetMm < b.fromCornerMm + b.widthMm &&
            b.fromCornerMm < entry.unit.offsetMm + entry.unit.widthMm,
        );

      /*
       * Ноль модулей под выступом — мерить нечего, и это падение,
       * а не «зазора нет».
       */
      check(
        `${shopName} · свес ${drop}: под выступом есть модули`,
        under.length > 0,
        under.length === 0 ? 'СЕЛЕКТОР ВЕРНУЛ НОЛЬ МОДУЛЕЙ' : `${under.length} шт.`,
      );
      if (under.length === 0) continue;

      const gaps = under.map((entry) => Math.round(bottomMm - (entry.y + entry.heightM) * 1000));

      check(
        `${shopName} · свес ${drop}: щели между шкафом и выступом нет`,
        gaps.every((gap) => Math.abs(gap) <= 1),
        `низ ригеля ${bottomMm} · зазоры ${gaps.join('/')} мм`,
      );

      /* Запрет прошлого захода держится: выше низа ригеля никто не лезет. */
      check(
        `${shopName} · свес ${drop}: и никто не заходит В выступ`,
        gaps.every((gap) => gap >= -1),
        `зазоры ${gaps.join('/')} мм`,
      );
    }
  }
}

/* ═══════════  Антресоль стоит на стене во всех режимах  ═══════════ */

/**
 * ЗАДНЯЯ ПЛОСКОСТЬ КАЖДОГО МОДУЛЯ ЛЕЖИТ НА СТЕНЕ.
 *
 * Мебель стоит у стены, а не висит в воздухе: разная глубина уводит
 * вперёд ПЕРЕДНЮЮ плоскость, а задняя остаётся на месте. На антресоли
 * это видно лучше всего — у неё глубина НИЖНЕГО ряда, то есть она
 * глубже соседей сверху, и место ей задаёт настройка цеха.
 *
 * Меряется то, что рисует сцена: коробки, собранные из `runPlaces`. Пока
 * место модуля считалось двумя формулами — одна со смещением по глубине,
 * другая без, — верхний ряд с антресолью уезжал на 240 мм вперёд от
 * стены, а рёбра оставались на месте.
 */
console.log('\nАнтресоль на стене');
{
  const shops = [
    ['цех 560/320/560', { baseMm: 560, upperMm: 320, mezzanineMm: 560 }],
    ['цех 550/350/550', { baseMm: 550, upperMm: 350, mezzanineMm: 550 }],
    /*
     * ТРЕТЬЯ ШКОЛА — ТА, ГДЕ ПРОВЕРКА ВООБЩЕ ЧТО-ТО ЗНАЧИТ.
     *
     * У первых двух глубина антресоли совпадает с нижним рядом, поэтому
     * смещение по глубине у неё ноль: она стоит правильно и при верной
     * формуле, и при забытой. Совпадение результата — не формула. Здесь
     * антресоль не равна ни нижнему ряду, ни верхнему, и забытое
     * смещение уводит её от стены на 100 мм.
     */
    ['цех 600/300/500', { baseMm: 600, upperMm: 300, mezzanineMm: 500 }],
    /* И умолчание продукта: у него антресоль идёт по верхнему ряду. */
    ['умолчание 560/320/320', DEFAULT_PRODUCTION.depths],
  ] as const;

  /** Толщины цеха берём одни на оба режима: сравниваем место, а не плиту. */
  const shopBox = { thicknessM: 0.016 };
  const frontOptions = (cutaway: boolean) => ({
    gapM: 0.003,
    frontThicknessM: 0.018,
    integratedHandles: false,
    cutaway,
  });

  for (const [title, depths] of shops) {
    const production: ProductionSettings = { ...DEFAULT_PRODUCTION, depths };

    const run = buildRun({
      lengthMm: 3800,
      ceilingHeightMm: 2700,
      requirements: DEMO_REQUIREMENTS,
      openings: [],
      comms: [],
      production,
    });

    const places = runPlaces(run);
    const mezz = places.filter((place) => place.unit.section === 'mezzanine');

    /*
     * НОЛЬ МОДУЛЕЙ И НОЛЬ АНТРЕСОЛЕЙ — ЭТО ПАДЕНИЕ, А НЕ «ПРОВЕРЯТЬ
     * НЕЧЕГО». Пустой селектор в проверке места означает, что мерить
     * нечем, и молчаливый пропуск сделал бы её зелёной на сломанном.
     */
    check(
      `${title}: ряд собран и антресоль в нём есть`,
      places.length > 0 && mezz.length > 0,
      places.length === 0
        ? 'НОЛЬ МОДУЛЕЙ В РЯДУ — место мерить не на чем'
        : mezz.length === 0
          ? 'НОЛЬ АНТРЕСОЛЕЙ В РЯДУ — проверять нечего'
          : `модулей ${places.length}, антресолей ${mezz.length}`,
    );
    if (places.length === 0 || mezz.length === 0) continue;

    const rowDepthMm = rowStandardDepthMm(run.zone, 'base', run.production);

    /** Задняя плоскость модуля в миллиметрах: перед минус глубина. */
    const backMm = (place: (typeof places)[number]) =>
      Math.round((place.zM - place.depthM) * 1000);

    const wrong = places.filter((place) => Math.abs(backMm(place) + rowDepthMm) > 1);
    check(
      `${title}: задняя плоскость каждого модуля лежит на стене`,
      wrong.length === 0,
      wrong.length === 0
        ? `${places.length} модулей, задняя у всех ${-rowDepthMm} мм`
        : `${wrong.length} мимо стены, первый ${wrong[0].unit.id}: ${backMm(wrong[0])} против ${-rowDepthMm} мм`,
    );

    check(
      `${title}: и у антресоли тоже, до миллиметра`,
      mezz.every((place) => Math.abs(backMm(place) + rowDepthMm) <= 1),
      `антресоль ${backMm(mezz[0])} мм при стене ${-rowDepthMm} мм`,
    );

    check(
      `${title}: глубина антресоли — настройка организации, а не глубина верхнего ряда`,
      mezz.every((place) => Math.abs(place.depthM * 1000 - depths.mezzanineMm) < 0.5),
      `${Math.round(mezz[0].depthM * 1000)} мм при настройке ${depths.mezzanineMm} и верхнем ряде ${depths.upperMm}`,
    );

    /*
     * ОБЫЧНОЕ 3D И «КАРКАС» — ОДНО МЕСТО.
     *
     * В «Каркасе» фасады сняты и корпус просвечивает, но мебель от этого
     * никуда не двигается. Меряются коробки обоих режимов той же
     * функцией, которой их строит сцена.
     */
    const backOfBoxes = (place: (typeof places)[number], cutaway: boolean) => {
      const boxes = moduleBoxes(
        place.unit,
        {
          x: place.x,
          y: place.y,
          heightM: place.heightM,
          depthM: place.depthM,
          zM: place.zM,
          ...shopBox,
        },
        frontOptions(cutaway),
        production,
      );
      if (boxes.length === 0) return null;
      return Math.round(Math.min(...boxes.map((box) => box.position[2] - box.scale[2] / 2)) * 1000);
    };

    const plain = backOfBoxes(mezz[0], false);
    const frame = backOfBoxes(mezz[0], true);

    check(
      `${title}: коробки антресоли есть в обоих режимах`,
      plain !== null && frame !== null,
      plain === null || frame === null
        ? 'НОЛЬ КОРОБОК У АНТРЕСОЛИ — сравнивать режимы не на чем'
        : `обычное 3D ${plain} мм · «Каркас» ${frame} мм`,
    );

    check(
      `${title}: в «Каркасе» антресоль стоит там же, где в обычном 3D`,
      plain !== null && frame !== null && Math.abs(plain - frame) <= 1,
      plain === null || frame === null
        ? 'НЕТ КОРОБОК'
        : `расхождение ${Math.abs(plain - frame)} мм`,
    );

    /*
     * И ЗАДНЯЯ ПЛОСКОСТЬ КОРОБОК — ТОЖЕ СТЕНА, А НЕ СОБСТВЕННАЯ ГЛУБИНА.
     *
     * Допуск 5 мм: задняя стенка вкладная, полка мельче корпуса — числа
     * отличаются на миллиметры конструкции, а не на глубину ряда.
     */
    const drifted = places
      .map((place) => ({ place, back: backOfBoxes(place, false) }))
      .filter((entry) => entry.back === null || Math.abs(entry.back + rowDepthMm) > 5);

    check(
      `${title}: коробки всего ряда упираются в стену, а не в свою глубину`,
      drifted.length === 0,
      drifted.length === 0
        ? `${places.length} модулей у стены ${-rowDepthMm} мм`
        : `${drifted.length} мимо: ${drifted[0].place.unit.id} на ${drifted[0].back} мм`,
    );
  }
}

/* ═══════════  Антресоль видна на всех четырёх видах  ═══════════ */

/**
 * ОДНА МЕБЕЛЬ НА СЦЕНЕ, ЧЕРТЕЖЕ, РАЗРЕЗЕ И ПЛАНЕ.
 *
 * Сцена научилась ставить антресоль на стену, а чертёж — нет: он считает
 * место своей формулой и рисует её на отметке навески, то есть внутри
 * колонны холодильника. Со стороны это читается как «антресоли на чертеже
 * нет», хотя объект там есть.
 *
 * Меряется РАЗМЕТКА, которую выдаёт каждый вид, а не картинка: отметки и
 * плоскости выходят наружу атрибутами и сверяются с `runPlaces` — той
 * единственной функцией, которая отвечает, где стоит модуль.
 */
console.log('\nАнтресоль на всех четырёх видах');
{
  const shops = [
    ['цех 560/320/560', { baseMm: 560, upperMm: 320, mezzanineMm: 560 }],
    /* Глубина антресоли не равна ни нижнему ряду, ни верхнему. */
    ['цех 600/300/500', { baseMm: 600, upperMm: 300, mezzanineMm: 500 }],
  ] as const;

  /** Атрибут нарисованного объекта: ищем по идентификатору модуля. */
  const attrOf = (html: string, moduleId: string, name: string): number | null => {
    const at = html.indexOf(`data-module-id="${moduleId}"`);
    if (at < 0) return null;

    /*
     * РОВНО ОДИН ТЕГ, А НЕ ОКНО ВОКРУГ.
     *
     * Первая версия брала ±500 символов и находила атрибут СОСЕДНЕГО
     * прямоугольника: план отвечал «перёд 320» там, где у антресоли 560.
     * Ошибка была в приборе, а не в продукте — ровно тот случай, когда
     * непроверенная проверка обвиняет исправный код.
     */
    const open = html.lastIndexOf('<', at);
    const close = html.indexOf('>', at);
    if (open < 0 || close < 0) return null;

    const tag = html.slice(open, close);
    const found = tag.match(new RegExp(`${name}="(-?[0-9.]+)"`));
    return found ? Number(found[1]) : null;
  };

  for (const [title, depths] of shops) {
    const production: ProductionSettings = { ...DEFAULT_PRODUCTION, depths };
    const run = buildRun({
      lengthMm: 3800,
      ceilingHeightMm: 2700,
      requirements: DEMO_REQUIREMENTS,
      openings: [],
      comms: [],
      production,
    });

    const places = runPlaces(run);
    const mezz = places.find((place) => place.unit.section === 'mezzanine');
    const rowDepth = rowStandardDepthMm(run.zone, 'base', run.production);

    check(
      `${title}: антресоль есть в ряду — виды проверять есть на чём`,
      Boolean(mezz),
      mezz
        ? `${mezz.unit.id}, глубина ${Math.round(mezz.depthM * 1000)} мм`
        : 'НОЛЬ АНТРЕСОЛЕЙ В РЯДУ — проверять нечего',
    );
    if (!mezz) continue;

    /** Где антресоль стоит по единственной функции — эталон для всех видов. */
    const trueBottom = Math.round(mezz.y * 1000);
    const trueTop = Math.round((mezz.y + mezz.heightM) * 1000);
    const trueDepth = Math.round(mezz.depthM * 1000);

    const views: Record<string, string> = {};
    let rendered = 0;
    const elements: [string, React.ReactElement][] = [
      ['фасад', React.createElement(ElevationDrawing, { run } as never)],
      ['план', React.createElement(PlanDrawing, { run, comms: [], issues: [] } as never)],
      ['разрез', React.createElement(SectionDrawing, { run } as never)],
    ];

    for (const [name, element] of elements) {
      try {
        views[name] = renderToStaticMarkup(element);
        rendered += 1;
      } catch (error) {
        views[name] = '';
        console.error(`       ${name} не отрисовался: ${(error as Error).message.slice(0, 120)}`);
      }
    }

    check(
      `${title}: все три плоских вида отрисовались`,
      rendered === 3,
      rendered === 3 ? 'фасад, план, разрез' : `ОТРИСОВАЛОСЬ ${rendered} ИЗ 3 — мерить не на чем`,
    );

    /* ── Антресоль есть как ОБЪЕКТ на каждом виде ── */

    const missing = (['фасад', 'план', 'разрез'] as const).filter(
      (name) => !views[name].includes(`data-module-id="${mezz.unit.id}"`),
    );

    check(
      `${title}: антресоль нарисована объектом на фасаде, плане и в разрезе`,
      missing.length === 0,
      missing.length === 0 ? 'есть на всех трёх' : `НЕТ КАК ОБЪЕКТА: ${missing.join(', ')}`,
    );

    /* ── Фасад: отметки те же, что у сцены ── */

    const drawnBottom = attrOf(views['фасад'], mezz.unit.id, 'data-bottom-mm');
    const drawnTop = attrOf(views['фасад'], mezz.unit.id, 'data-top-mm');

    check(
      `${title}: на фасаде антресоль стоит там же, где в сцене`,
      drawnBottom !== null &&
        drawnTop !== null &&
        Math.abs(drawnBottom - trueBottom) <= 1 &&
        Math.abs(drawnTop - trueTop) <= 1,
      drawnBottom === null || drawnTop === null
        ? 'НЕТ ОТМЕТОК У АНТРЕСОЛИ НА ФАСАДЕ'
        : `чертёж ${drawnBottom}…${drawnTop} · сцена ${trueBottom}…${trueTop} · ниже на ${trueBottom - drawnBottom} мм`,
    );

    /* ── План и разрез: зад на стене, перёд уводит глубина ── */

    for (const name of ['план', 'разрез'] as const) {
      const back = attrOf(views[name], mezz.unit.id, 'data-back-mm');
      const front = attrOf(views[name], mezz.unit.id, 'data-front-mm');

      check(
        `${title}: в виде «${name}» зад антресоли на стене, перёд на её глубине`,
        back !== null && front !== null && back === 0 && Math.abs(front - trueDepth) <= 1,
        back === null || front === null
          ? `НЕТ ПЛОСКОСТЕЙ У АНТРЕСОЛИ В ВИДЕ «${name}»`
          : `зад ${back} перёд ${front} при глубине ${trueDepth} мм и ряде ${rowDepth} мм`,
      );
    }

    /* ── Аксонометрия листа строится из тех же коробок, что сцена ── */

    const axoBoxes = axonometryBoxes(run, 'closed', { thicknessMm: 16, frontMm: 18, gapMm: 3 });
    const boxes = runBoxes(run, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 });

    /*
     * Полоса антресоли по высоте единственная в ряду, поэтому коробки
     * отбираются по ней: сравнивать спроецированные грани бесполезно —
     * на бумаге от миллиметров натуры не остаётся ничего.
     */
    const inMezzBand = (box: (typeof boxes)[number]) =>
      box.position[1] > mezz.y + 0.01 && box.position[1] < mezz.y + mezz.heightM - 0.01;

    const backOf = (list: typeof boxes) => {
      const band = list.filter(inMezzBand);
      if (band.length === 0) return null;
      return Math.round(Math.min(...band.map((box) => box.position[2] - box.scale[2] / 2)) * 1000);
    };

    const axoBack = backOf(axoBoxes);
    const sceneBack = backOf(boxes);

    check(
      `${title}: коробки антресоли есть и на листе, и в сцене`,
      axoBack !== null && sceneBack !== null,
      axoBack === null || sceneBack === null
        ? 'НОЛЬ КОРОБОК АНТРЕСОЛИ — сравнивать нечего'
        : `лист ${axoBack} мм · сцена ${sceneBack} мм`,
    );

    check(
      `${title}: на аксонометрии листа зад антресоли лежит на стене`,
      axoBack !== null && Math.abs(axoBack + rowDepth) <= 3,
      axoBack === null
        ? 'НЕТ КОРОБОК АНТРЕСОЛИ НА ЛИСТЕ'
        : `лист ${axoBack} мм при стене ${-rowDepth} мм · расхождение ${Math.abs(axoBack + rowDepth)} мм`,
    );

    check(
      `${title}: лист и сцена ставят антресоль в одно место`,
      axoBack !== null && sceneBack !== null && Math.abs(axoBack - sceneBack) <= 1,
      axoBack === null || sceneBack === null
        ? 'НЕТ КОРОБОК'
        : `расхождение ${Math.abs(axoBack - sceneBack)} мм`,
    );

  }
}

/* ═══════════  Правка антресоли доезжает во все виды  ═══════════ */

/**
 * ОДНА ПРАВКА — ОДНО ЧИСЛО ВО ВСЕХ СЕМИ МЕСТАХ.
 *
 * Антресоль стала рядом, который правится. Значит правка обязана
 * приехать туда же, куда приезжает правка нижнего ряда: в сцену, на
 * фасад, в разрез, на план, в раскрой и в смету. Место и глубину везде
 * считает `runPlaces` — второй формулы после прошлого захода не осталось,
 * и эта проверка держит её отсутствие.
 */
console.log('\nПравка антресоли во всех видах');
{
  const production: ProductionSettings = {
    ...DEFAULT_PRODUCTION,
    depths: { baseMm: 600, upperMm: 300, mezzanineMm: 500 },
  };

  const built = buildRun({
    lengthMm: 3800,
    ceilingHeightMm: 2700,
    requirements: DEMO_REQUIREMENTS,
    openings: [],
    comms: [],
    production,
  });

  const withMezz = applyOps({
    run: built,
    requirements: DEMO_REQUIREMENTS,
    ops: [{ op: 'set_mezzanine', heightMm: 400 }],
  });

  const own = (r: typeof withMezz) =>
    r.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, r) === null);

  const before = own(withMezz);

  check(
    'заказанная антресоль собралась — правку проверять есть на чём',
    before.length > 1,
    before.length === 0
      ? 'НОЛЬ МОДУЛЕЙ ЗАКАЗАННОЙ АНТРЕСОЛИ — править нечего'
      : `модулей ${before.length}: ${before.map((u) => u.id).join(', ')}`,
  );

  if (before.length > 1) {
    const target = before[1];
    const wantMm = target.widthMm > 400 ? target.widthMm - 150 : target.widthMm + 150;

    const edited = applyOps({
      run: withMezz,
      requirements: DEMO_REQUIREMENTS,
      ops: [{ op: 'set_width', moduleId: target.id, widthMm: wantMm }],
    });

    const after = own(edited).find((unit) => unit.offsetMm === target.offsetMm);

    check(
      'ширина доехала до состава ряда',
      after?.widthMm === wantMm,
      `было ${target.widthMm} · просили ${wantMm} · стало ${after?.widthMm ?? 'МОДУЛЯ НЕТ'}`,
    );

    if (after) {
      /* ── 1. Сцена ── */

      const place = runPlaces(edited).find((entry) => entry.unit.id === after.id);
      const rowDepth = rowStandardDepthMm(edited.zone, 'base', edited.production);

      check(
        'модуль есть в раскладке сцены',
        Boolean(place),
        place ? `${place.unit.id} ширина ${Math.round(place.unit.widthMm)}` : 'В СЦЕНЕ МОДУЛЯ НЕТ',
      );

      check(
        'в сцене у него новая ширина и задняя плоскость на стене',
        Boolean(place) &&
          place!.unit.widthMm === wantMm &&
          Math.abs(Math.round((place!.zM - place!.depthM) * 1000) + rowDepth) <= 1,
        place
          ? `ширина ${place.unit.widthMm} · зад ${Math.round((place.zM - place.depthM) * 1000)} при стене ${-rowDepth}`
          : 'НЕТ МЕСТА',
      );

      const boxes = runBoxes(edited, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 });

      check(
        'коробки сцены у него есть',
        boxes.length > 0 && Boolean(place),
        boxes.length === 0 ? 'НОЛЬ КОРОБОК В СЦЕНЕ' : `коробок в ряду ${boxes.length}`,
      );

      /* ── 2. Фасад, разрез, план ── */

      const views: Record<string, string> = {};
      const elements: [string, React.ReactElement][] = [
        ['фасад', React.createElement(ElevationDrawing, { run: edited } as never)],
        ['план', React.createElement(PlanDrawing, { run: edited, comms: [], issues: [] } as never)],
        ['разрез', React.createElement(SectionDrawing, { run: edited } as never)],
      ];
      for (const [name, element] of elements) {
        try {
          views[name] = renderToStaticMarkup(element);
        } catch {
          views[name] = '';
        }
      }

      /*
       * ФАСАД И ПЛАН ПОКАЗЫВАЮТ МОДУЛЬ, РАЗРЕЗ — ПОЛОСУ.
       *
       * Боковой срез идёт поперёк ряда: модули, стоящие на разном
       * расстоянии от угла, в него не попадают, и требовать там
       * конкретный идентификатор значит требовать вид, которого не
       * бывает. Разрез несёт ГЛУБИНУ полосы — её и меряем.
       */
      const drawn = (['фасад', 'план'] as const).filter((name) =>
        views[name].includes(`data-module-id="${after.id}"`),
      );

      check(
        'правленый модуль нарисован на фасаде и на плане',
        drawn.length === 2,
        drawn.length === 2
          ? 'есть на обоих'
          : `НЕТ НА ВИДАХ: ${(['фасад', 'план'] as const).filter((n) => !drawn.includes(n)).join(', ')}`,
      );

      const mezzDepth = Math.round(place!.depthM * 1000);
      const bandFront = views['разрез'].match(
        /data-back-mm="0"[^>]*data-front-mm="(\d+)"/g,
      );
      const bandDepths = (bandFront ?? []).map((tag) =>
        Number(tag.match(/data-front-mm="(\d+)"/)![1]),
      );

      check(
        'в разрезе есть полоса антресоли со своей глубиной',
        bandDepths.includes(mezzDepth),
        bandDepths.length === 0
          ? 'НОЛЬ ПОЛОС ВИСЯЩИХ РЯДОВ В РАЗРЕЗЕ — мерить нечего'
          : `полосы ${bandDepths.join('/')} мм при антресоли ${mezzDepth} мм`,
      );

      /* ── 3. Раскрой ── */

      const fronts = buildPanels({ run: edited }).filter(
        (panel) => panel.moduleId === after.id && panel.name === 'Фасад',
      );

      check(
        'фасад правленого модуля есть в раскрое',
        fronts.length > 0,
        fronts.length === 0 ? 'НОЛЬ ФАСАДОВ В РАСКРОЕ' : `${fronts.length} шт., ширина ${fronts[0].widthMm} мм`,
      );

      check(
        'и его ширина в раскрое следует за правкой',
        fronts.length > 0 && Math.abs(fronts[0].widthMm - wantMm) < 20,
        fronts.length === 0
          ? 'НЕТ ФАСАДА'
          : `раскрой ${fronts[0].widthMm} мм при модуле ${wantMm} мм`,
      );
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
