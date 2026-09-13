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
import type { Run } from '../types/millwork';
import { runPlaces } from '../lib/millwork/cabinetBoxes';
import { GEOMETRY } from '../lib/millwork/modules';
import { zoneProfile } from '../lib/millwork/zones';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import { rowStandardDepthMm } from '../lib/millwork/fill';
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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
