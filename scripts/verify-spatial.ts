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
  type RunPlacement,
} from '../lib/millwork/composition';
import { buildRun } from '../lib/millwork/layout';
import { runPlaces } from '../lib/millwork/cabinetBoxes';
import { GEOMETRY } from '../lib/millwork/modules';
import { zoneProfile } from '../lib/millwork/zones';
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
      depthMm: DEPTH_MM,
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

        const places3d = runPlaces(run, {
          depthM,
          plinthM: GEOMETRY.base.plinthH / 1000,
        });

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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
