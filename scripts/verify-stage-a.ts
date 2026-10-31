/**
 * ADVANCED CAD · STAGE A — УГОЛ И ЧИСТОТА 3D (входит в test:millwork).
 *
 * Отдельный запуск: `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-stage-a.ts`
 * — тот же набор, свой счёт (для отката правки при сохранённом тесте).
 *
 * Путь экрана — `scripts/corner-quality-fixture.ts` (`objectSite` →
 * `compositionFor` → `objectInput` → `composeVariants` → `wallSegments` →
 * `runPlacements`), композиции директивы: прямая 3800, Г 3800 + 1140, П 3800 +
 * 1140 + 1740 и П 2800 + 3600 + 2800 с Г-модулями. Сцену меряем коробками,
 * которые рисует `Cabinet3D` (`runBoxes`, по модулям — `runBoxesByModule`),
 * подвижные детали — списком `sceneLeaves`, по которому их ведёт
 * `CabinetModule3D`, положение на ходу — `leafPoses` / `bifoldPoses`.
 */
import { U_DIRECTIVE, buildObject, compositionAttemptOf, NEW_CORNER, SPECS, openWidthOf } from './corner-quality-fixture';
import { DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { allModules, buildRun } from '../lib/millwork/layout';
import { moduleAppliances } from '../lib/millwork/modules';
import { missingAppliances } from '../lib/millwork/screen';
import { RUN_TEMPLATES, requirementsFromTemplate, templateFits } from '../lib/millwork/templates';
import {
  DRAWER_TRAVEL_M,
  bifoldPoses,
  closedFrontRect,
  doorLeaves,
  leafPoses,
  openablePartIds,
  runBoxes,
  runBoxesByModule,
  runPlaces,
  sceneLeaves,
  sceneSlides,
  type PartBox,
  type PosedBox,
} from '../lib/millwork/cabinetBoxes';
import { cornerFillersOf, cornerGeometry, cornerOfSegment } from '../lib/millwork/corner';
import { nicheFacadeSpans } from '../lib/millwork/applianceFront';
import { buildPanels, objectPanels, panelMaterials } from '../lib/millwork/panels';
import { buildEstimate } from '../lib/millwork/estimate';
import { cuttingPlan, stockBaseKey } from '../lib/millwork/cutting';
import { DEMO_RATES } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { carcassHeightMm, plinthMm } from '../lib/millwork/shop';
import { tallOvensOf } from '../lib/millwork/cookingStack';
import { ovenShape } from '../lib/millwork/applianceShapes';
import { rowStandardDepthMm } from '../lib/millwork/fill';
import { CORNER_FILLER_PANEL_NAME, CORNER_OWNER_FILLER_PANEL_NAME, CORNER_UPPER_FILLER_PANEL_NAME } from '../lib/millwork/panels';
import { cornerClashMismatches, mismatchPriceText, wallMismatchMessage, wallMismatches } from '../lib/millwork/walls';
import { screenState } from '../lib/millwork/screen';
import { changeCorner, cornerCards } from '../lib/millwork/cornerChange';
import { runPlacements } from '../lib/millwork/composition';
import { DEFAULT_STRATEGIES, withStrategy } from '../lib/millwork/variants';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import type { ApplianceKind, CornerChoice, Opening, Run } from '../types/millwork';

type Check = (name: string, condition: boolean, detail?: string) => void;

const MM = 1000;
type V3 = [number, number, number];

const SCHOOLS: [string, ProductionSettings][] = [
  ['560/320', DEFAULT_PRODUCTION],
  [
    '550/350',
    {
      ...DEFAULT_PRODUCTION,
      depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
      heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
    },
  ],
  ['600/300', { ...DEFAULT_PRODUCTION, depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 } }],
];

const shopOf = (production: ProductionSettings) => ({
  thicknessMm: production.carcassMm,
  frontThicknessMm: production.frontMm,
  gapMm: production.frontGapMm,
  production,
});

/* ─────────────────────────  геометрия мира  ───────────────────────── */

type Place = { xM: number; zM: number; rotationYDeg: number };

/** Точка ряда (м) → мир (м): тот же поворот, что у группы ряда в сцене. */
function toWorld(place: Place, [x, y, z]: V3): V3 {
  const a = (place.rotationYDeg * Math.PI) / 180;
  return [x * Math.cos(a) + z * Math.sin(a) + place.xM, y, -x * Math.sin(a) + z * Math.cos(a) + place.zM];
}

type Aabb = { min: V3; max: V3; tag: string };

/** Коробка ряда (центр, размер) → габарит в мире, мм. Поворот рядов кратен 90° — габарит точный. */
function worldAabb(place: Place, center: V3, size: V3, tag: string): Aabb {
  const pts: V3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push(toWorld(place, [center[0] + (sx * size[0]) / 2, center[1] + (sy * size[1]) / 2, center[2] + (sz * size[2]) / 2]));
  }
  return {
    min: [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])) * MM) as V3,
    max: [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])) * MM) as V3,
    tag,
  };
}

/** Насколько две коробки входят друг в друга, мм (наименьшее перекрытие по трём осям; ноль и меньше — не входят). */
function overlap(a: Aabb, b: Aabb): number {
  return Math.min(...[0, 1, 2].map((k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k])));
}

/* Коробка на ходу: центр, полуоси и оси в мире (повороты вокруг вертикали и горизонтали). */
type Obb = { c: V3; e: V3; u: [V3, V3, V3]; tag: string };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function obbOf(place: Place, pose: { center: V3; size: V3; yaw?: number; pitch?: number }, tag: string): Obb {
  const yaw = pose.yaw ?? 0;
  const pitch = pose.pitch ?? 0;
  /* Оси коробки в осях ряда: сначала наклон вокруг x, затем поворот вокруг y. */
  const ux: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const uy: V3 = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
  const uz: V3 = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const a = (place.rotationYDeg * Math.PI) / 180;
  const turn = (v: V3): V3 => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  const c = toWorld(place, pose.center).map((v) => v * MM) as V3;
  return { c, e: pose.size.map((v) => (v * MM) / 2) as V3, u: [turn(ux), turn(uy), turn(uz)], tag };
}

function obbOfAabb(box: Aabb): Obb {
  return {
    c: [0, 1, 2].map((k) => (box.min[k] + box.max[k]) / 2) as V3,
    e: [0, 1, 2].map((k) => (box.max[k] - box.min[k]) / 2) as V3,
    u: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    tag: box.tag,
  };
}

/** Перекрытие двух коробок, мм: теорема о разделяющей оси, 15 осей. */
function obbDepth(A: Obb, B: Obb): number {
  const axes: V3[] = [...A.u, ...B.u];
  for (const a of A.u) for (const b of B.u) {
    const n = cross(a, b);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len > 1e-9) axes.push([n[0] / len, n[1] / len, n[2] / len]);
  }
  const d: V3 = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  let least = Infinity;
  for (const axis of axes) {
    const ra = A.e.reduce((sum, e, k) => sum + e * Math.abs(dot(A.u[k], axis)), 0);
    const rb = B.e.reduce((sum, e, k) => sum + e * Math.abs(dot(B.u[k], axis)), 0);
    least = Math.min(least, ra + rb - Math.abs(dot(d, axis)));
    if (least <= 0) return least;
  }
  return least;
}

/* ─────────────────────────  ряды для сверки списков  ───────────────────────── */

/** Ряды шаблонов на типовых длинах — состав, на котором работают девять замерщиков из десяти. */
function templateRuns(): { title: string; run: Run }[] {
  const out: { title: string; run: Run }[] = [];
  for (const template of RUN_TEMPLATES) {
    for (const lengthMm of [1600, 2400, 3200, 3800, 4200, 5200]) {
      if (!templateFits(template, lengthMm)) continue;
      out.push({
        title: `${template.id} ${lengthMm}`,
        run: buildRun({
          id: `${template.id}-${lengthMm}`,
          lengthMm,
          ceilingHeightMm: 2700,
          requirements: requirementsFromTemplate(template),
          openings: [],
          comms: [],
          production: DEFAULT_PRODUCTION,
        }),
      });
    }
  }
  return out;
}

/**
 * ЗАХОДЫ НА ВСЁМ ХОДУ — СВОИМ СЧЁТОМ, А НЕ МОДУЛЕМ КИНЕМАТИКИ (SA.7).
 *
 * Положения — те, что рисует сцена (`leafPoses`, `bifoldPoses`, коробки
 * пачки ящика на ходу `DRAWER_TRAVEL_M`); шаг — 0,5° у створки и Г-фасада и
 * 1 мм у ящика; перекрытие — своя теорема о разделяющей оси (`obbDepth`),
 * а не `cornerKinematics`. Меряются детали соседних по углу стен. Заход —
 * глубже 0,01 мм: ниже — шум арифметики, а касание (ноль) законно.
 */
type Sweep = { wall: number; other: number; leaf: string; module: string; obstacle: string; depthMm: number };
function sweepClashes(segments: Run[], places: Place[], production: ProductionSettings): { found: Sweep[]; poses: number } {
  const shop = shopOf(production);
  const solidsOf = segments.map((run, wall) => {
    const grouped = runBoxesByModule(run, shop);
    const list: { box: Aabb; obb: Obb; name: string }[] = [];
    for (const box of grouped.fillers) {
      const aabb = worldAabb(places[wall], box.position, box.scale, box.panel ?? 'панель');
      list.push({ box: aabb, obb: obbOfAabb(aabb), name: box.panel ?? 'панель' });
    }
    for (const { unit, boxes } of grouped.modules) {
      for (const box of boxes) {
        const aabb = worldAabb(places[wall], box.position, box.scale, unit.label);
        list.push({ box: aabb, obb: obbOfAabb(aabb), name: `${unit.label} ${box.node ?? box.material}` });
      }
    }
    return list;
  });
  const meet = (a: Aabb, b: Aabb) => [0, 1, 2].every((k) => a.min[k] <= b.max[k] && b.min[k] <= a.max[k]);
  const worst = new Map<string, Sweep>();
  let poses = 0;
  segments.forEach((run, wall) => {
    const rowBoxes = runBoxes(run, shop);
    const others = [wall - 1, wall + 1]
      .filter((other) => other >= 0 && other < segments.length)
      .flatMap((other) => solidsOf[other].map((solid) => ({ ...solid, wall: other })));
    for (const entry of runPlaces(run)) {
      for (const leaf of sceneLeaves(entry.unit, entry.heightM, openWidthOf(entry.unit, run))) {
        const at = (s: number): Obb[] => {
          if (leaf.kind === 'door') {
            const own = rowBoxes.find((box) => box.part === leaf.id && box.node === 'handle');
            const handle = own ? { ...own, position: [own.position[0] - entry.x, own.position[1] - entry.y, own.position[2] - entry.zM] as V3 } : null;
            return leafPoses({
              opening: leaf.opening,
              x: leaf.xM,
              y: leaf.bottomM,
              width: leaf.widthM,
              height: leaf.heightM,
              thickness: production.frontMm / MM,
              gap: production.frontGapMm / MM,
              handle,
              s,
              /* Ходит деталь деталировки (F9) — та же, что нарисована закрытой. */
              rect: closedFrontRect(rowBoxes.filter((box) => box.part === leaf.id), [entry.x + leaf.xM, entry.y + leaf.bottomM]),
            }).map((box) => obbOf(places[wall], { ...box, center: [box.center[0] + entry.x, box.center[1] + entry.y, box.center[2] + entry.zM] }, leaf.id));
          }
          if (leaf.kind === 'bifold') {
            return bifoldPoses(
              entry.unit,
              { x: entry.x, y: entry.y, heightM: entry.heightM, depthM: entry.depthM, thicknessM: production.carcassMm / MM, zM: entry.zM },
              { gapM: production.frontGapMm / MM, frontThicknessM: production.frontMm / MM, integratedHandles: false },
              s,
            ).map((box: PosedBox) => obbOf(places[wall], box, leaf.id));
          }
          return rowBoxes
            .filter((box: PartBox) => box.part === leaf.id)
            .map((box) => obbOf(places[wall], { center: [box.position[0], box.position[1], box.position[2] + DRAWER_TRAVEL_M * s], size: box.scale }, leaf.id));
        };
        const steps = leaf.kind === 'door' ? 180 : leaf.kind === 'bifold' ? 360 : Math.round(DRAWER_TRAVEL_M * MM);
        /* Грубый отбор по девяти положениям с запасом 400 мм на путь точки между ними. */
        let coarse: Aabb | null = null;
        for (let i = 0; i <= 8; i += 1) {
          for (const obb of at(i / 8)) {
            const r = [0, 1, 2].map((k) => obb.e.reduce((sum, e, j) => sum + e * Math.abs(obb.u[j][k]), 0));
            const min = [0, 1, 2].map((k) => obb.c[k] - r[k] - 400) as V3;
            const max = [0, 1, 2].map((k) => obb.c[k] + r[k] + 400) as V3;
            coarse = coarse
              ? { min: [0, 1, 2].map((k) => Math.min(coarse!.min[k], min[k])) as V3, max: [0, 1, 2].map((k) => Math.max(coarse!.max[k], max[k])) as V3, tag: '' }
              : { min, max, tag: '' };
          }
        }
        if (!coarse) continue;
        const near = others.filter((other) => meet(coarse!, other.box));
        if (near.length === 0) continue;
        for (let i = 0; i <= steps; i += 1) {
          for (const box of at(i / steps)) {
            poses += 1;
            for (const other of near) {
              const depth = obbDepth(box, other.obb);
              if (depth <= 0.01) continue;
              const key = `${wall}|${entry.unit.id}:${leaf.id}|${other.wall}|${other.name}`;
              const was = worst.get(key);
              if (!was || depth > was.depthMm) {
                worst.set(key, { wall, other: other.wall, leaf: leaf.id.slice(entry.unit.id.length + 1), module: entry.unit.label, obstacle: other.name, depthMm: depth });
              }
            }
          }
        }
      }
    }
  });
  return { found: Array.from(worst.values()), poses };
}

export function stageAChecks(check: Check): void {
  const objects = SPECS.map((spec) => buildObject(spec));
  const byKey = new Map(objects.map((object) => [object.key, object]));
  const objectOf = (key: string) => {
    const object = byKey.get(key);
    if (!object) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: STAGE A — объекта «${key}» нет`);
    return object;
  };

  /* ═════════════ SA.1 Прибор, не вставший на свою стену, ищет другую ═════════════ */
  {
    type Built = ReturnType<typeof buildObject>;
    const stands = (object: Built) =>
      new Set(object.engine.segments.flatMap((run) => allModules(run).flatMap((unit) => moduleAppliances(unit))));
    const wallOf = (object: Built, appliance: ApplianceKind) =>
      object.engine.segments.findIndex((run) => allModules(run).some((unit) => moduleAppliances(unit).includes(appliance)));
    const missing = (object: Built) =>
      missingAppliances({
        requested: object.requirements.appliances,
        shown: object.engine.segments,
        layout: object.engine.layout,
        edited: () => false,
        active: 0,
      });
    const refusals = (object: Built) =>
      (object.engine.layout?.segments ?? []).flatMap((segment) => segment.run.warnings.filter((w) => w.includes('не помещается')));
    const all = (object: Built) => object.requirements.appliances.every((appliance) => stands(object).has(appliance));
    const words = (object: Built) =>
      object.engine.segments
        .map((run, i) => `${['А', 'Б', 'В'][i]}: ${allModules(run).flatMap((unit) => moduleAppliances(unit)).join('+') || '—'}`)
        .join(' · ');

    {
      const object = objectOf('l');
      check(
        `SA.1 ${object.title}: вся техника стоит, холодильник и духовка — на стене А; отказов раскладки и строк о пропаже 0`,
        all(object) && wallOf(object, 'fridge') === 0 && wallOf(object, 'oven') === 0 && missing(object).length === 0 && refusals(object).length === 0,
        `${words(object)} · отказов ${refusals(object).length} · пропаж ${missing(object).length}${refusals(object)[0] ? ` («${refusals(object)[0]}»)` : ''}`,
      );
    }
    {
      /* П: пеналы — на самую короткую стену В (1080 мм): холодильник там встаёт, духовке места нет — она переезжает. */
      const object = objectOf('u');
      const ruleWall = object.engine.layout?.segments.findIndex((segment) => segment.appliances.includes('fridge')) ?? -1;
      check(
        `SA.1 ${object.title}: вся техника стоит — холодильник на стене В по правилу, духовка, не вставшая там, на другой стене; отказов и строк о пропаже 0`,
        all(object) && wallOf(object, 'fridge') === 2 && ruleWall === 2 && wallOf(object, 'oven') !== 2 && wallOf(object, 'oven') >= 0 && missing(object).length === 0 && refusals(object).length === 0,
        `${words(object)} · отказов ${refusals(object).length} · пропаж ${missing(object).length}${refusals(object)[0] ? ` («${refusals(object)[0]}»)` : ''}`,
      );
    }

    /* П 3200 + 2400 + 3200 (приёмка P0.4): духовка, которой не хватило стены Б, встала на другой — у всех школ. */
    const narrow = SCHOOLS.map(([school, production]) => {
      const object = buildObject({ key: 'u-narrow', title: `П 3200 + 2400 + 3200 · ${school}`, lengths: [3200, 2400, 3200], shape: 'u_shape', corners: [NEW_CORNER, NEW_CORNER], production });
      return { school, ok: all(object) && missing(object).length === 0, words: words(object), missing: missing(object)[0]?.message };
    });
    check(
      'SA.1 П 3200 + 2400 + 3200 (3 школы): духовка встала на стене, где ей хватает места, — строк о пропаже 0',
      narrow.length === 3 && narrow.every((entry) => entry.ok),
      narrow.map((entry) => `${entry.school}: ${entry.ok ? entry.words : `ПРОПАЖА «${entry.missing}»`}`).join(' | '),
    );

    /* Выбор человека сильнее правила: холодильник, закреплённый за стеной Б, не переезжает — его отказ назван там. */
    const pinned = buildObject({ ...SPECS[1], key: 'l-pinned', requirements: { ...DEMO_REQUIREMENTS, applianceWalls: { fridge: 'w2' } } });
    const pinnedLine = missing(pinned).find((warning) => warning.id === 'appliance-missing-fridge');
    check(
      'SA.1 холодильник, закреплённый за стеной Б: остаётся за ней и назван словами с миллиметрами; духовка — на стене А',
      Boolean(pinned.engine.layout?.segments[1].appliances.includes('fridge')) &&
        wallOf(pinned, 'fridge') === -1 &&
        wallOf(pinned, 'oven') === 0 &&
        pinnedLine?.severity === 'blocking' &&
        (pinnedLine?.message.includes('Холодильник: не помещается — свободно 480 мм, нужно 600 мм, не хватает 120 мм.') ?? false),
      `${words(pinned)} · ${pinnedLine?.message ?? 'СТРОКИ НЕТ'}`,
    );

    /* Не выбивает стоявших: на Г 2400 + 1140 колонне не место на стене А — она остаётся отказом, мойка, посудомойка и варочная стоят. */
    const tight = buildObject({ key: 'l-tight', title: 'Г 2400 + 1140', lengths: [2400, 1140], shape: 'corner_l', corners: [NEW_CORNER] });
    const tightA = new Set(allModules(tight.engine.segments[0]).flatMap((unit) => moduleAppliances(unit)));
    check(
      'SA.1 Г 2400 + 1140: на стене А колонне места нет — она не выбивает мойку, посудомойку и варочную, холодильник и духовка названы отказом',
      ['sink600', 'dishwasher45', 'hob', 'hood'].every((a) => tightA.has(a as ApplianceKind)) &&
        !tightA.has('fridge') &&
        !tightA.has('oven') &&
        missing(tight).some((warning) => warning.id === 'appliance-missing-fridge') &&
        missing(tight).some((warning) => warning.id === 'appliance-missing-oven'),
      `${words(tight)} · ${missing(tight).map((warning) => warning.message).join(' | ') || 'СТРОК НЕТ'}`,
    );

    /*
     * ПРИВЯЗАННОЕ К ВЕНТКАНАЛУ НЕ УЕЗЖАЕТ САМО. Г 3000 + 3000, выступ стены А на 1100…2400 мм: варочной не хватает
     * стены А. На стене Б ей место есть — закреплённая там пара встаёт; без вытяжки варочная (одна розетка) переезжает
     * туда сама. С вытяжкой — нет: вытяжку ведут к вентканалу, и увести её на другую стену решает замерщик.
     */
    const ledge: Opening = { id: 'ledge', kind: 'protrusion', fromCornerMm: 1100, widthMm: 1300, sillMm: 0, heightMm: 2700, depthMm: 400 };
    const ledgeSpec = { key: 'l-ledge', title: 'Г 3000 + 3000, выступ 1100…2400', lengths: [3000, 3000], shape: 'corner_l' as const, corners: [NEW_CORNER], openings: [[ledge]] };
    const withHood = buildObject(ledgeSpec);
    const hoodPinned = buildObject({ ...ledgeSpec, requirements: { ...DEMO_REQUIREMENTS, applianceWalls: { hob: 'w2', hood: 'w2' } } });
    const noHood = buildObject({ ...ledgeSpec, requirements: { ...DEMO_REQUIREMENTS, appliances: DEMO_REQUIREMENTS.appliances.filter((a) => a !== 'hood') } });
    check(
      'SA.1 варочная с вытяжкой (вентканал) сама стену не меняет: на Г 3000 + 3000 с выступом пара отказом на стене А, хотя закреплённая за Б там встаёт; без вытяжки варочная переезжает на Б сама',
      wallOf(withHood, 'hob') === -1 &&
        Boolean(withHood.engine.layout?.segments[0].appliances.includes('hob')) &&
        missing(withHood).some((warning) => warning.id === 'appliance-missing-hob') &&
        wallOf(hoodPinned, 'hob') === 1 &&
        wallOf(hoodPinned, 'hood') === 1 &&
        wallOf(noHood, 'hob') === 1 &&
        !missing(noHood).some((warning) => warning.id === 'appliance-missing-hob'),
      `с вытяжкой: ${words(withHood)} · закреплены за Б: ${words(hoodPinned)} · без вытяжки: ${words(noHood)}`,
    );

    /* П директивы 3800 + 1140 + 1740: ряды А и В друг против друга в 1140 мм — физически не собрать, отказ словами. */
    const directive = compositionAttemptOf(U_DIRECTIVE);
    const reason = directive?.state === 'refused' ? directive.reason : '';
    check(
      'SA.1 П 3800 + 1140 + 1740: композиция отказывает словами — стены А и В в 1140 мм, двум рядам нужно 1152 мм, фасады вошли бы на 12 мм',
      directive?.state === 'refused' &&
        reason.includes('в 1140 мм') &&
        reason.includes('нужно 1152 мм') &&
        reason.includes('на 12 мм') &&
        !/Error|undefined|NaN/.test(reason),
      directive?.state === 'refused' ? reason : `СОБРАЛАСЬ: ${directive?.state ?? 'нет композиции'}`,
    );
  }

  /* ═════════════ SA.2 Один список: что открывается = что нарисовано закрытым = что режется ═════════════ */
  {
    const templates = templateRuns();
    const fixtureRows = objects.reduce((sum, object) => sum + object.engine.segments.length, 0);
    const runs = [
      ...templates,
      ...objects.flatMap((object) => object.engine.segments.map((run, i) => ({ title: `${object.title} · стена ${i + 1}`, run }))),
    ];
    let modules = 0;
    let leaves = 0;
    let stacked = 0;
    let spanned = 0;
    const drift: string[] = [];
    for (const { title, run } of runs) {
      const openable = new Set(openablePartIds(run));
      const scene = new Set<string>();
      for (const place of runPlaces(run)) {
        const unit = place.unit;
        modules += 1;
        const own = sceneLeaves(unit, place.heightM, openWidthOf(unit, run));
        own.forEach((leaf) => scene.add(leaf.id));
        leaves += own.length;
        if (unit.builtIn && own.filter((leaf) => leaf.kind === 'door').length === 2) stacked += 1;
        if (own.some((leaf) => leaf.kind === 'door' && leaf.bottomM > 0)) spanned += 1;
        /* Створки сцены — ровно участки раскроя (`doorLeaves`), у слепого угла — первая на доступной части. */
        if (unit.section !== 'glass_display' && unit.kind !== 'corner_base' && unit.kind !== 'corner_upper') {
          const cut = doorLeaves(unit, Math.round(place.heightM * MM));
          /* Слепой угол: створка одна, на доступной части; доступной нет — створки нет (те же правила, что у `openablePartIds`). */
          const open = openWidthOf(unit, run);
          const want = (open === 0 ? [] : open !== undefined ? cut.slice(0, 1) : cut).map((leaf) => `${unit.id}:door:${leaf.index}`);
          const got = own.filter((leaf) => leaf.kind === 'door' || leaf.kind === 'pullout').map((leaf) => leaf.id);
          if (want.join(',') !== got.join(',')) drift.push(`${title} ${unit.id}: сцена [${got.join(', ')}] · раскрой [${want.join(', ')}]`);
        }
      }
      const bays = Array.from(openable).filter((id) => /:b\d+(?::z\d+)?:drawer:\d+$/.test(id));
      const extra = Array.from(openable).filter((id) => !scene.has(id) && !bays.includes(id));
      const silent = Array.from(scene).filter((id) => !openable.has(id));
      if (extra.length > 0) drift.push(`${title}: «Открыть всё» отмечает, а сцена не ведёт — ${extra.slice(0, 4).join(', ')}`);
      if (silent.length > 0) drift.push(`${title}: сцена ведёт, а «Открыть всё» не знает — ${silent.slice(0, 4).join(', ')}`);
      /* Каждой открываемой детали есть что нарисовать закрытой — и закрытых подвижных деталей нет вне списка. */
      const slides = new Set(sceneSlides(run).map((slide) => slide.id));
      const closed = new Set(runBoxes(run, shopOf(DEFAULT_PRODUCTION)).flatMap((box) => (box.part ? [box.part] : [])));
      const bare = Array.from(openable).filter((id) => !closed.has(id));
      const stray = Array.from(closed).filter((id) => !openable.has(id) && !slides.has(id));
      if (bare.length > 0) drift.push(`${title}: открывается, а закрытой не нарисовано — ${bare.slice(0, 4).join(', ')}`);
      if (stray.length > 0) drift.push(`${title}: нарисовано подвижным вне списка — ${stray.slice(0, 4).join(', ')}`);
    }
    check(
      `SA.2 один список на ${runs.length} рядов: створки сцены = участки раскроя, «Открыть всё» = что ведёт сцена = что нарисовано закрытым`,
      drift.length === 0 && fixtureRows === 9 && runs.length === templates.length + 9 && templates.length > 0 && modules > 0 && stacked > 0 && spanned > 0,
      drift.length === 0
        ? `рядов ${runs.length} (шаблонов ${templates.length}, композиций ${fixtureRows}), модулей ${modules}, подвижных ${leaves}; холодильников с двумя дверями ${stacked}, модулей с участками по высоте ${spanned}`
        : `${drift.length}: ${drift.slice(0, 4).join(' | ')}`,
    );

    /* Раскрой встроенного холодильника: деталь своей створки — свой фасад верхней двери доезжает до цеха. */
    const straight = objectOf('straight').engine.segments[0];
    const fridge = straight.modules.find((unit) => unit.appliance === 'fridge' && unit.builtIn);
    if (!fridge) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: SA.2 — на прямой 3800 нет встроенного холодильника');
    const enamel = applyOps({
      run: straight,
      requirements: objectOf('straight').requirements,
      ops: [{ op: 'set_leaf_front', moduleId: fridge.id, leaf: 'door:1', front: { base: 'mdf_enamel', construct: 'solid', finish: 'gloss' } }],
      openings: [],
      roomDepthMm: 0,
    });
    const rows = buildPanels({ run: enamel, production: DEFAULT_PRODUCTION }).filter((panel) => panel.moduleId === fridge.id && panel.name === 'Фасад встройки');
    const before = buildPanels({ run: straight, production: DEFAULT_PRODUCTION }).filter((panel) => panel.moduleId === fridge.id && panel.name === 'Фасад встройки');
    check(
      'SA.2 холодильник: свой фасад верхней двери (door:1) — своя строка раскроя; без него — одна строка на две двери, как было',
      enamel.warnings.length === 0 &&
        before.length === 1 &&
        before[0].qty === 2 &&
        rows.length === 2 &&
        rows.some((panel) => panel.frontLeaf === 'door:1' && panel.qty === 1) &&
        rows.some((panel) => panel.frontLeaf === undefined && panel.qty === 1),
      `без своего: ${before.map((panel) => `${panel.qty} шт.${panel.frontLeaf ? ` (${panel.frontLeaf})` : ''}`).join(', ')} · ` +
        `с эмалью на двери 2: ${rows.map((panel) => `${panel.qty} шт. ${panel.material}${panel.frontLeaf ? ` (${panel.frontLeaf})` : ''}`).join(', ') || 'СТРОК НЕТ'}` +
        (enamel.warnings[0] ? ` · «${enamel.warnings[0]}»` : ''),
    );
  }

  /* ═════════════ SA.3 Полотно в покое — то же, что закрытое; открытое уходит наружу ═════════════ */
  {
    let doors = 0;
    let drawers = 0;
    const drift: string[] = [];
    const runs = [
      ...templateRuns(),
      ...objects.flatMap((object) => object.engine.segments.map((run, i) => ({ title: `${object.title} · стена ${i + 1}`, run }))),
    ];
    const shop = shopOf(DEFAULT_PRODUCTION);
    const gap = DEFAULT_PRODUCTION.frontGapMm / MM;
    const tf = DEFAULT_PRODUCTION.frontMm / MM;
    const near = (a: number, b: number) => Math.abs(a - b) * MM < 0.01;
    for (const { title, run } of runs) {
      const boxes = runBoxes(run, shop);
      for (const place of runPlaces(run)) {
        for (const leaf of sceneLeaves(place.unit, place.heightM, openWidthOf(place.unit, run))) {
          if (leaf.kind === 'drawer') {
            drawers += 1;
            const front = boxes.find((box) => box.part === leaf.id && box.material === 'front');
            if (!front) {
              drift.push(`${title} ${leaf.id}: у ящика нет закрытого фронта`);
              continue;
            }
            const mid = place.y + leaf.bottomM + leaf.heightM / 2;
            if (!near(front.position[1], mid) || front.scale[1] > leaf.heightM + 1e-9) {
              drift.push(`${title} ${leaf.id}: фронт на ${Math.round(front.position[1] * MM)} мм при участке ${Math.round(mid * MM)} мм`);
            }
            continue;
          }
          if (leaf.kind !== 'door' || leaf.glass) continue;
          doors += 1;
          const closed = boxes.find((box) => box.part === leaf.id && box.material === 'front');
          if (!closed) {
            drift.push(`${title} ${leaf.id}: закрытого полотна нет`);
            continue;
          }
          /* Путь экрана (F9): ходовое полотно — деталь закрытой коробки (`closedFrontRect`), как в `CabinetModule3D`. */
          const rect = closedFrontRect(boxes.filter((box) => box.part === leaf.id), [place.x + leaf.xM, place.y + leaf.bottomM]);
          const pose = (s: number) =>
            leafPoses({ opening: leaf.opening, x: leaf.xM, y: leaf.bottomM, width: leaf.widthM, height: leaf.heightM, thickness: tf, gap, handle: null, s, rect }).find(
              (box) => box.role === 'front',
            )!;
          const rest = pose(0);
          const at: V3 = [rest.center[0] + place.x, rest.center[1] + place.y, rest.center[2] + place.zM];
          const same = [0, 1, 2].every((k) => near(at[k], closed.position[k]) && near(rest.size[k], closed.scale[k]));
          if (!same) {
            drift.push(
              `${title} ${leaf.id}: в покое ${at.map((v) => Math.round(v * MM)).join('/')} · ${rest.size.map((v) => Math.round(v * MM)).join('×')} ` +
                `при закрытом ${closed.position.map((v) => Math.round(v * MM)).join('/')} · ${closed.scale.map((v) => Math.round(v * MM)).join('×')}`,
            );
          }
          const open = pose(1);
          if (!(open.center[2] - rest.center[2] > 0.01)) {
            drift.push(`${title} ${leaf.id}: открытое полотно не вышло вперёд (${Math.round((open.center[2] - rest.center[2]) * MM)} мм)`);
          }
        }
      }
    }
    check(
      'SA.3 каждое полотно в покое — та же коробка, что закрытый фасад (± 0,01 мм), открытое — перед корпусом; фронт ящика — на своём участке',
      drift.length === 0 && doors > 0 && drawers > 0,
      drift.length === 0 ? `створок ${doors}, ящиков ${drawers}` : `${drift.length}: ${drift.slice(0, 4).join(' | ')}`,
    );
  }

  /* ═════════════ SA.3 За открытой створкой — то, что режется: прибор стоит в своей нише ═════════════ */
  {
    /*
     * Пенал с духовкой режется створками над нишей и под ней (`nicheFacadeSpans`), за ними — отсеки. Лицо прибора,
     * нарисованное во всю высоту модуля, вставало за открытыми створками чёрной плитой вместо полок. Мерим коробки,
     * которые рисует сцена: лицо прибора (без подвижной детали и узла) не заходит ни на один участок створки.
     */
    const runs = [
      ...templateRuns(),
      ...objects.flatMap((object) => object.engine.segments.map((run, i) => ({ title: `${object.title} · стена ${i + 1}`, run }))),
    ];
    let split = 0;
    let faces = 0;
    const drift: string[] = [];
    let models = 0;
    for (const { title, run } of runs) {
      const byModule = new Map(runBoxesByModule(run, shopOf(DEFAULT_PRODUCTION)).modules.map((entry) => [entry.unit.id, entry.boxes]));
      /*
       * Духовой шкаф в пенале и колонне — модель, а не коробка (ЭТАП 4): его габарит
       * по высоте — от верха полки-опоры (`tallOvensOf`) на высоту модели (`ovenShape`).
       */
      const ovens = new Map(tallOvensOf(run, DEFAULT_PRODUCTION).map((oven) => [oven.unit.id, oven]));
      for (const place of runPlaces(run)) {
        const unit = place.unit;
        const spans = nicheFacadeSpans(unit, Math.round(place.heightM * MM));
        if (!spans) continue;
        split += 1;
        /* Лицо прибора — коробки без подвижной детали; узел у них один — «прибор» (слой «Техника», ЭТАП 3), не ручка и не петля. */
        const face: { position: number[]; scale: number[] }[] = (byModule.get(unit.id) ?? []).filter(
          (box) =>
            (box.material === 'appliance' || box.material === 'glass') && box.part === undefined && (box.node === undefined || box.node === 'appliance'),
        );
        const oven = ovens.get(unit.id);
        if (oven) {
          const ys = ovenShape(oven.model).parts.flatMap((part) => ('at' in part && 'size' in part ? [part.at[1] - part.size[1] / 2, part.at[1] + part.size[1] / 2] : []));
          const lo = oven.bottomMm / MM + Math.min(0, ...ys) / MM;
          const hi = oven.bottomMm / MM + Math.max(...ys) / MM;
          face.push({ position: [0, (lo + hi) / 2, 0], scale: [0, hi - lo, 0] });
          models += 1;
        }
        if (face.length === 0) {
          drift.push(`${title} ${unit.id}: прибора в нише не нарисовано`);
          continue;
        }
        faces += face.length;
        for (const box of face) {
          const lo = box.position[1] - box.scale[1] / 2;
          const hi = box.position[1] + box.scale[1] / 2;
          for (const span of spans) {
            const from = place.y + span.fromMm / MM;
            const to = from + span.heightMm / MM;
            const inside = Math.min(hi, to) - Math.max(lo, from);
            if (inside > 0.001) {
              drift.push(
                `${title} ${unit.id}: прибор ${Math.round(lo * MM)}…${Math.round(hi * MM)} мм заходит за створку ${Math.round(from * MM)}…${Math.round(to * MM)} мм на ${Math.round(inside * MM)} мм`,
              );
            }
          }
        }
      }
    }
    check(
      'SA.3 за открытой створкой — то, что режется: прибор пенала стоит в своей нише и за створки над и под ней не заходит',
      drift.length === 0 && split > 0 && faces > 0 && models > 0,
      drift.length === 0 ? `модулей с нишей ${split}, коробок прибора и моделей ${faces} (из них моделей духового шкафа ${models})` : `${drift.length}: ${drift.slice(0, 3).join(' | ')}`,
    );
  }

  /* ═════════════ SA.4 Закрытый фасад лежит в плоскости фасада своего корпуса ═════════════ */
  {
    let fronts = 0;
    const drift: string[] = [];
    for (const spec of SPECS) {
      for (const [school, production] of SCHOOLS) {
        const shown = buildObject({ ...spec, production });
        shown.engine.segments.forEach((run, wall) => {
          const places = new Map(runPlaces(run).map((place) => [place.unit.id, place]));
          for (const { unit, boxes } of runBoxesByModule(run, shopOf(production)).modules) {
            /* Г-модуль: фасад Б стоит в плоскости соседа — его угол меряет приёмка слоя 55. */
            if (unit.kind === 'corner_base' || unit.kind === 'corner_upper') continue;
            const place = places.get(unit.id);
            if (!place) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: SA.4 — у модуля ${unit.id} нет места в ряду`);
            for (const box of boxes) {
              if (box.material !== 'front') continue;
              fronts += 1;
              const back = (box.position[2] - box.scale[2] / 2) * MM;
              const x0 = (box.position[0] - box.scale[0] / 2) * MM;
              const x1 = (box.position[0] + box.scale[0] / 2) * MM;
              const y0 = (box.position[1] - box.scale[1] / 2) * MM;
              const y1 = (box.position[1] + box.scale[1] / 2) * MM;
              const plane = place.zM * MM;
              const inside =
                x0 >= place.x * MM - 0.01 &&
                x1 <= (place.x + unit.widthMm / MM) * MM + 0.01 &&
                y0 >= place.y * MM - 0.01 &&
                y1 <= (place.y + place.heightM) * MM + 0.01;
              if (Math.abs(back - plane) > 0.01 || !inside) {
                drift.push(
                  `${shown.title} · ${school} · стена ${wall + 1} ${unit.id} ${box.panel ?? box.part ?? 'фасад'}: тыл ${back.toFixed(2)} при плоскости ${plane.toFixed(2)}${inside ? '' : ' · выходит за корпус'}`,
                );
              }
            }
          }
        });
      }
    }
    check(
      `SA.4 ${SPECS.length} композиции × ${SCHOOLS.length} школы: каждый закрытый фасад — тылом в плоскости фасада своего корпуса (± 0,01 мм) и в его габарите`,
      drift.length === 0 && fronts > 0,
      drift.length === 0 ? `фасадов ${fronts}` : `${drift.length}: ${drift.slice(0, 4).join(' | ')}`,
    );
  }

  /* ═════════════ SA.5 Мир композиций директивы: стена, пол, пересечения, угол, ход ═════════════ */
  {
    let configs = 0;
    let modules = 0;
    let pairs = 0;
    let corners = 0;
    let poses = 0;
    const backs: string[] = [];
    const floors: string[] = [];
    const hits: string[] = [];
    const holes: string[] = [];
    const clashes: string[] = [];
    const handleTouches: string[] = [];
    for (const spec of SPECS) {
      for (const [school, production] of SCHOOLS) {
        const object = buildObject({ ...spec, production });
        configs += 1;
        const tag = `${object.title} · ${school}`;
        const { segments, places } = object.engine;
        const shop = shopOf(production);
        const plinth = plinthMm(production);

        /* Коробки мира по модулям и стенам: чьё — чтобы не мерить деталь саму с собой. */
        type Solid = { box: Aabb; wall: number; owner: string; front: boolean; handle: boolean };
        const solids: Solid[] = [];
        segments.forEach((run, wall) => {
          const grouped = runBoxesByModule(run, shop);
          for (const box of grouped.fillers) {
            solids.push({ box: worldAabb(places[wall], box.position, box.scale, `стена ${wall + 1} ${box.panel ?? 'добор'}`), wall, owner: `filler:${wall}:${box.panel}:${box.position[0]}`, front: box.material === 'front', handle: false });
          }
          for (const { unit, boxes } of grouped.modules) {
            for (const box of boxes) {
              solids.push({
                box: worldAabb(places[wall], box.position, box.scale, `стена ${wall + 1} ${unit.id} ${box.panel ?? box.node ?? box.material}`),
                wall,
                owner: unit.id,
                front: box.material === 'front' || box.node === 'handle',
                handle: box.node === 'handle',
              });
            }
          }
          /* Задняя плоскость каждого модуля — на стене ряда; низ нижнего ряда — на цоколе. */
          const entries = runPlaces(run);
          modules += entries.length;
          const backPlanes = entries.map((entry) => Math.round((entry.zM - entry.depthM) * MM * 100) / 100);
          if (Math.max(...backPlanes) - Math.min(...backPlanes) > 0.5) {
            backs.push(`${tag} · стена ${wall + 1}: задние плоскости ${Math.min(...backPlanes)}…${Math.max(...backPlanes)} мм`);
          }
          const wallPlane = -rowStandardDepthMm(run.zone, 'base', production);
          if (Math.abs(Math.min(...backPlanes) - wallPlane) > 0.5) backs.push(`${tag} · стена ${wall + 1}: тыл ${Math.min(...backPlanes)} при стене ${wallPlane}`);
          for (const entry of entries) {
            if (!run.modules.includes(entry.unit)) continue;
            if (Math.abs(entry.y * MM - plinth) > 0.5) floors.push(`${tag} · стена ${wall + 1} ${entry.unit.id}: низ ${Math.round(entry.y * MM)} мм при цоколе ${plinth}`);
          }
        });

        /* Ни одна деталь модуля не входит в деталь другого модуля — ни на своей стене, ни на чужой. */
        for (let i = 0; i < solids.length; i += 1) {
          for (let j = i + 1; j < solids.length; j += 1) {
            const a = solids[i];
            const b = solids[j];
            if (a.owner === b.owner) continue;
            pairs += 1;
            const depth = overlap(a.box, b.box);
            if (depth > 0.5) hits.push(`${tag}: ${a.box.tag} × ${b.box.tag} на ${depth.toFixed(1)} мм`);
          }
        }

        /*
         * УГОЛ БЕЗ ЩЕЛИ БЕЗ ПРИЧИНЫ. Полоса стыкующегося ряда от плоскости фасадов владельца до первого модуля
         * закрыта — фальш-панелью (слепой угол) или фасадом Б Г-модуля; у верхнего ряда — так же, если угол не
         * пустой по выбору человека. Меряется вдоль ряда шагом 2 мм по нарисованным фасадам на плоскости фасадов:
         * непокрытое длиннее зазора и толщины фасада — дыра.
         */
        const strip = (wall: number, fromMm: number, toMm: number, yM: number, zM: number) => {
          const fronts = solids.filter((s) => s.front && (s.wall === wall || s.wall === wall - 1));
          let gapRun = 0;
          let worst = 0;
          for (let x = fromMm; x <= toMm; x += 2) {
            const p = toWorld(places[wall], [x / MM, yM, zM]).map((v) => v * MM) as V3;
            const covered = fronts.some((s) => [0, 1, 2].every((k) => p[k] >= s.box.min[k] - 0.01 && p[k] <= s.box.max[k] + 0.01));
            gapRun = covered ? 0 : gapRun + 2;
            worst = Math.max(worst, gapRun);
          }
          return worst;
        };
        const allowed = production.frontGapMm + production.frontMm + 2;
        object.corners.forEach((choice, c) => {
          const dock = segments[c + 1];
          if (!dock) return;
          corners += 1;
          const g = cornerGeometry(choice, dock.zone, production);
          const baseDepth = rowStandardDepthMm(dock.zone, 'base', production);
          const tfM = production.frontMm / 2 / MM;
          const lowerY = (plinth + carcassHeightMm(production) / 2) / MM;
          const lower = strip(c + 1, -(g.lostMm - baseDepth), 0, lowerY, tfM);
          if (lower > allowed) holes.push(`${tag} · угол ${c + 1} низ (${choice.lower}): непокрытая полоса ${lower} мм при допуске ${allowed}`);
          if (choice.upper === 'empty') return;
          const uppers = runPlaces(dock).filter(
            (entry) =>
              dock.upperSegments.some((segment) => segment.modules.includes(entry.unit)) &&
              entry.unit.section !== 'mezzanine' &&
              !entry.unit.overhead,
          );
          const first = uppers.sort((a, b) => a.x - b.x)[0];
          if (!first) return;
          const upperDepth = rowStandardDepthMm(dock.zone, 'upper', production);
          const upper = strip(c + 1, upperDepth - g.lostMm, Math.round(first.x * MM), first.y + first.heightM / 2, first.zM + tfM);
          if (upper > allowed) holes.push(`${tag} · угол ${c + 1} верх (${choice.upper}): непокрытая полоса ${upper} мм при допуске ${allowed}`);
        });

        /* Ход: каждая дверь, ящик и Г-фасад на ¼ · ½ · ¾ · 1 не входит в детали ДРУГИХ стен. */
        segments.forEach((run, wall) => {
          const others = solids.filter((s) => s.wall !== wall).map((s) => ({ obb: obbOfAabb(s.box), handle: s.handle }));
          const rowBoxes = runBoxes(run, shop);
          for (const entry of runPlaces(run)) {
            const leaves = sceneLeaves(entry.unit, entry.heightM, openWidthOf(entry.unit, run));
            for (const leaf of leaves) {
              for (const s of [0.25, 0.5, 0.75, 1]) {
                let moving: (Obb & { handle: boolean })[] = [];
                if (leaf.kind === 'door') {
                  /* Ручка створки — коробка той же пачки, в осях модуля: она едет с полотном. */
                  const own = rowBoxes.find((box) => box.part === leaf.id && box.node === 'handle');
                  const handle = own
                    ? { ...own, position: [own.position[0] - entry.x, own.position[1] - entry.y, own.position[2] - entry.zM] as V3 }
                    : null;
                  moving = leafPoses({
                    opening: leaf.opening,
                    x: leaf.xM,
                    y: leaf.bottomM,
                    width: leaf.widthM,
                    height: leaf.heightM,
                    thickness: production.frontMm / MM,
                    gap: production.frontGapMm / MM,
                    handle,
                    s,
                    rect: closedFrontRect(rowBoxes.filter((box) => box.part === leaf.id), [entry.x + leaf.xM, entry.y + leaf.bottomM]),
                  }).map((box) => ({
                    ...obbOf(places[wall], { ...box, center: [box.center[0] + entry.x, box.center[1] + entry.y, box.center[2] + entry.zM] }, `стена ${wall + 1} ${leaf.id}${box.role === 'handle' ? ' ручка' : ''}`),
                    handle: box.role === 'handle',
                  }));
                } else if (leaf.kind === 'bifold') {
                  moving = bifoldPoses(
                    entry.unit,
                    { x: entry.x, y: entry.y, heightM: entry.heightM, depthM: entry.depthM, thicknessM: production.carcassMm / MM, zM: entry.zM },
                    { gapM: production.frontGapMm / MM, frontThicknessM: production.frontMm / MM, integratedHandles: false },
                    s,
                  ).map((box: PosedBox) => ({ ...obbOf(places[wall], box, `стена ${wall + 1} ${leaf.id}${box.role === 'handle' ? ' ручка' : ''}`), handle: box.role === 'handle' }));
                } else {
                  /* Ящик и карго едут вперёд на ход ящика: всё, что едет, — коробки пачки. */
                  moving = rowBoxes
                    .filter((box: PartBox) => box.part === leaf.id)
                    .map((box) => ({
                      ...obbOf(
                        places[wall],
                        { center: [box.position[0], box.position[1], box.position[2] + DRAWER_TRAVEL_M * s], size: box.scale },
                        `стена ${wall + 1} ${leaf.id}${box.node === 'handle' ? ' ручка' : ''}`,
                      ),
                      handle: box.node === 'handle',
                    }));
                }
                for (const box of moving) {
                  poses += 1;
                  for (const other of others) {
                    const depth = obbDepth(box, other.obb);
                    if (depth <= 0.5) continue;
                    const line = `${tag}: ${box.tag} на ходу ${s} входит в ${other.obb.tag} на ${depth.toFixed(1)} мм`;
                    /* Ручка с одной из сторон — касание у угла (решение за владельцем); фасад или корпус в фасад или корпус — дефект. */
                    if (box.handle || other.handle) handleTouches.push(line);
                    else clashes.push(line);
                  }
                }
              }
            }
          }
        });
      }
    }
    const want = SPECS.length * SCHOOLS.length;
    check(
      `SA.5 ${want} конфигураций (4 композиции × 3 школы): задняя плоскость каждого модуля — на стене ряда, нижний ряд стоит на цоколе`,
      configs === want && backs.length === 0 && floors.length === 0 && modules > 0,
      backs.length === 0 && floors.length === 0 ? `модулей ${modules}` : [...backs, ...floors].slice(0, 4).join(' | '),
    );
    check(
      'SA.5 ни одна деталь модуля не входит в деталь другого модуля — на своей стене и на чужой',
      hits.length === 0 && pairs > 0,
      hits.length === 0 ? `пар деталей ${pairs}` : `${hits.length}: ${hits.slice(0, 4).join(' | ')}`,
    );
    check(
      'SA.5 в углу нет щели без причины: полоса до первого модуля стыкующейся стены закрыта фальш-панелью или фасадом Г-модуля',
      holes.length === 0 && corners > 0,
      holes.length === 0 ? `углов ${corners}` : `${holes.length}: ${holes.slice(0, 3).join(' | ')}`,
    );
    check(
      'SA.5 двери, ящики и Г-фасады на ¼ · ½ · ¾ · 1 хода не входят в фасады и корпуса других стен',
      clashes.length === 0 && poses > 0,
      clashes.length === 0 ? `положений ${poses}` : `${clashes.length}: ${clashes.slice(0, 4).join(' | ')}`,
    );
    /*
     * РУЧКИ У УГЛА — отдельной строкой, и она не ослаблена: касание ручки у угла — тот же вопрос, что известные 4 мм
     * слоя 55 (ширина фальш-панели против вылета ручки — настройка цеха, решение за владельцем). Отдельно — чтобы
     * ожидающее решение не прятало дефекты строки выше.
     */
    check(
      'SA.5 на ходу ничего не задевает ручки другой стены и ручка на ходу — ничего на другой стене',
      handleTouches.length === 0 && poses > 0,
      handleTouches.length === 0 ? `положений ${poses}` : `${handleTouches.length}: ${handleTouches.slice(0, 4).join(' | ')}`,
    );
  }

  /* ═════════════ SA.6 Рентген снимает все фасады — и фальш-панели угла ═════════════ */
  {
    const drift: string[] = [];
    let fillers = 0;
    for (const object of objects) {
      object.engine.segments.forEach((run, wall) => {
        const solid = runBoxes(run, shopOf(DEFAULT_PRODUCTION));
        const xray = runBoxes(run, { ...shopOf(DEFAULT_PRODUCTION), cutaway: true });
        const want = cornerFillersOf(run).length;
        const drawn = solid.filter((box) => box.panel?.includes('Фальш-панель')).length;
        fillers += drawn;
        if (drawn !== want) drift.push(`${object.title} · стена ${wall + 1}: фальш-панелей нарисовано ${drawn} при ${want}`);
        const leaked = xray.filter((box) => box.material === 'front');
        if (leaked.length > 0) drift.push(`${object.title} · стена ${wall + 1}: в рентгене фасадов ${leaked.length} (${leaked.slice(0, 3).map((box) => box.panel ?? box.part ?? '?').join(', ')})`);
      });
    }
    check(
      'SA.6 рентген: ни одной коробки фасада, включая фальш-панели угла; без рентгена фальш-панелей столько, сколько у угла',
      drift.length === 0 && fillers > 0,
      drift.length === 0 ? `фальш-панелей ${fillers}` : `${drift.length}: ${drift.slice(0, 3).join(' | ')}`,
    );
  }

  /* ═════════════ SA.7 Фальш-панели по ходу: заход снят конструкцией, а не допуском ═════════════ */
  {
    const fmt = (list: Sweep[]) => list.slice(0, 3).map((x) => `стена ${x.wall + 1} ${x.module} ${x.leaf} → стена ${x.other + 1} ${x.obstacle} ${x.depthMm.toFixed(2)} мм`).join(' | ');
    const MIXED60: ProductionSettings = { ...DEFAULT_PRODUCTION, corner: { falsePanelMm: 60, lowerLMm: 1000, upperLMm: 600, confirmed: true } };
    const SIX = SCHOOLS[2][1];
    const blind: CornerChoice = { lower: 'blind', upper: 'blind' };

    /* Все композиции директивы на трёх школах: по всему ходу — ноль заходов. */
    let swept = 0;
    let sweptPoses = 0;
    const all: string[] = [];
    for (const spec of SPECS) {
      for (const [school, production] of SCHOOLS) {
        const object = buildObject({ ...spec, production });
        const { found, poses } = sweepClashes(object.engine.segments, object.engine.places, production);
        swept += 1;
        sweptPoses += poses;
        if (found.length > 0) all.push(`${object.title} · ${school}: ${fmt(found)}`);
        if ((object.engine.layout?.cornerClashes ?? []).length > 0) all.push(`${object.title} · ${school}: композиция назвала заход — ${object.engine.layout!.cornerClashes![0].words}`);
      }
    }
    check(
      `SA.7 ${SPECS.length * SCHOOLS.length} конфигураций (4 композиции × 3 школы): весь ход створок, ящиков и Г-фасадов — шаг 0,5° и 1 мм, свой счёт — ни одного захода в мебель соседней стены`,
      swept === SPECS.length * SCHOOLS.length && sweptPoses > 0 && all.length === 0,
      all.length === 0 ? `положений ${sweptPoses}` : `${all.length}: ${all.slice(0, 2).join(' || ')}`,
    );

    /* Случай 1 слоя 63: П смешанная, школа «угол 60/1000» — панель стены В 64 мм вместо 60, деталь в раскрое и сцене. */
    {
      const object = buildObject({
        key: 'u-mixed',
        title: 'П 2800 + 3600 + 2800 смешанная',
        lengths: [2800, 3600, 2800],
        shape: 'u_shape',
        corners: [
          { lower: 'l_shape', upper: 'empty' },
          { lower: 'blind', upper: 'l_shape' },
        ],
        production: MIXED60,
        /* Рабочая стена — первая, как в слое 55 (там стена А 2800, а не самая длинная). */
        wallId: 'w1',
      });
      const layout = object.engine.layout!;
      const dock = object.engine.segments[2];
      const part = buildPanels({ run: dock, production: MIXED60 }).find((panel) => panel.name === CORNER_FILLER_PANEL_NAME);
      const drawn = runBoxes(dock, shopOf(MIXED60)).find((box) => box.panel === CORNER_FILLER_PANEL_NAME);
      const { found } = sweepClashes(object.engine.segments, object.engine.places, MIXED60);
      check(
        'SA.7 П смешанная «угол 60/1000»: заход 4 мм снят — фальш-панель стены В 64 мм вместо 60 (деталь 64 − зазор 4 = 60 мм в раскрое и та же ширина в сцене), по всему ходу заходов 0, ряд В короче на 4 мм',
        layout.corners[1]?.choice.clearance?.dockMm === 64 &&
          layout.corners[1]?.falsePanelMm === 64 &&
          part?.widthMm === 64 - MIXED60.frontGapMm &&
          Boolean(drawn) &&
          Math.abs(drawn!.scale[0] * MM - (64 - MIXED60.frontGapMm)) < 0.01 &&
          dock.lengthMm === 2800 - (rowStandardDepthMm(dock.zone, 'base', MIXED60) + 64) &&
          found.length === 0 &&
          (layout.corners[1]?.clearanceWhy ?? []).some((line) => line.includes('64 мм') && line.includes('на 4 мм')),
        `панель ${layout.corners[1]?.choice.clearance?.dockMm ?? 'нет'} · деталь ${part?.widthMm ?? 'НЕТ'} · сцена ${drawn ? Math.round(drawn.scale[0] * MM) : 'НЕТ'} · ряд В ${dock.lengthMm} · заходов ${found.length}${found.length ? `: ${fmt(found)}` : ''} · ${(layout.corners[1]?.clearanceWhy ?? [])[0] ?? 'слов нет'}`,
      );

      /*
       * ПРАВЛЕНЫЙ СОСЕД СТОИТ ЗА СВОЕЙ ПАНЕЛЬЮ. Стена В, собранная без панели
       * по ходу (ряд 2180 мм за панелью 60), открыта правленой: длина её
       * стены — за ЕЁ панелью, расхождения длины нет, заход 4 мм назван с
       * «64 мм вместо 60», ряд на месте.
       */
      const segment = layout.segments[2];
      const mixedCorners: CornerChoice[] = [
        { lower: 'l_shape', upper: 'empty' },
        { lower: 'blind', upper: 'l_shape' },
      ];
      const strategy = DEFAULT_STRATEGIES.find((item) => item.key === 'optimal')!;
      const old = buildRun({
        id: 'ws-2',
        lengthMm: segment.wallLengthMm - cornerGeometry(mixedCorners[1], 'kitchen', MIXED60).lostMm,
        ceilingHeightMm: 2700,
        requirements: {
          ...withStrategy(DEMO_REQUIREMENTS, strategy),
          cornerSolution: 'false_panel' as const,
          corners: mixedCorners,
          appliances: segment.appliances,
          tallSide: DEMO_REQUIREMENTS.tallSide === 'right' ? 'left' : 'right',
        },
        openings: segment.openings,
        comms: segment.comms,
        corner: cornerOfSegment(mixedCorners, 2, 3),
        production: MIXED60,
        wallId: segment.wallId,
      });
      const edited = buildObject({
        key: 'u-mixed',
        title: 'П 2800 + 3600 + 2800 смешанная',
        lengths: [2800, 3600, 2800],
        shape: 'u_shape',
        corners: mixedCorners,
        production: MIXED60,
        wallId: 'w1',
        edits: { [segment.wallId]: old },
      });
      const shown = edited.engine.segments[2];
      const lengthMismatches = wallMismatches(edited.engine.layout, edited.engine.segments);
      const clashes = cornerClashMismatches({
        runs: edited.engine.segments,
        places: edited.engine.places,
        production: MIXED60,
        edited: (index) => index === 2,
        composed: edited.engine.layout?.cornerClashes,
      });
      const text = clashes[0] ? wallMismatchMessage(clashes[0]) : '';
      check(
        'SA.7 правленая стена В (ряд 2180 за панелью 60) стоит за своей панелью: расхождения длины нет, ряд на месте, заход 4 мм назван с «64 мм вместо 60»',
        old.lengthMm === 2180 &&
          shown.lengthMm === 2180 &&
          !shown.corner?.start?.clearance &&
          lengthMismatches.length === 0 &&
          clashes.length === 1 &&
          clashes[0].index === 2 &&
          text.includes('на 4 мм') &&
          text.includes('64 мм вместо 60'),
        `ряд ${old.lengthMm} → на экране ${shown.lengthMm} · расхождений длины ${lengthMismatches.length}${lengthMismatches.length ? `: ${wallMismatchMessage(lengthMismatches[0]).slice(0, 120)}` : ''} · заходов ${clashes.length} · ${text.slice(0, 220)}`,
      );
    }

    /* Случай 2: П 3800 + 2400 + 1740, школа 600/300 — панель стены Б у слепого модуля 14 мм (до F9 — 12). */
    {
      const object = buildObject({ ...SPECS[2], production: SIX });
      const layout = object.engine.layout!;
      const owner = object.engine.segments[1];
      const part = buildPanels({ run: owner, production: SIX }).find((panel) => panel.name === CORNER_OWNER_FILLER_PANEL_NAME);
      const drawn = runBoxes(owner, shopOf(SIX)).find((box) => box.panel === CORNER_OWNER_FILLER_PANEL_NAME);
      const { found } = sweepClashes(object.engine.segments, object.engine.places, SIX);
      check(
        'SA.7 П 3800 + 2400 + 1740 (600/300): заход ящика 12 мм снят — фальш-панель стены Б у слепого модуля 14 мм (деталь 14 − зазор 4 = 10 мм в раскрое и в сцене), отпечаток 39eb9664, по всему ходу заходов 0',
          /*
           * F9 (2026-10-31): 12 → 14 мм. Фронт ящика под варочной режется
           * «ширина модуля − зазор» (деталировка), а сцена рисовала его на
           * два зазора уже; ход меряется по настоящей детали — она на 2 мм
           * ближе к углу, и панели по ходу нужно на 2 мм больше. Ряд за
           * панелью сдвинут на эти 2 мм: отпечаток 92872717 → 39eb9664.
           */
        layout.corners[1]?.choice.clearance?.ownerMm === 14 &&
          layout.corners[1]?.ownerPanelMm === 14 &&
          part?.widthMm === 14 - SIX.frontGapMm &&
          Boolean(drawn) &&
          Math.abs(drawn!.scale[0] * MM - (14 - SIX.frontGapMm)) < 0.01 &&
          /*
           * 466a5605 → 92872717 (ЭТАП 4): полка кладовки над холодильником
           * встала по высоте кладовки (160 вместо 256 в корпусе 300), у
           * одиночного прибора в пенале появились полки-опоры; панели угла и
           * ход те же.
           */
          layout.fingerprint === '39eb9664' &&
          found.length === 0,
        `панель ${layout.corners[1]?.choice.clearance?.ownerMm ?? 'нет'} · деталь ${part?.widthMm ?? 'НЕТ'} · сцена ${drawn ? Math.round(drawn.scale[0] * MM) : 'НЕТ'} · отпечаток ${layout.fingerprint} · заходов ${found.length}${found.length ? `: ${fmt(found)}` : ''}`,
      );

      /*
       * ПРАВЛЕНЫЙ РЯД СВОЮ ПАНЕЛЬ ДЕРЖИТ. Стена Б, собранная раскладкой без
       * панели по ходу (объект до STAGE A), открыта правленой: мебель на
       * месте, длина та же, а заход назван блокирующим с миллиметрами — цены
       * нет, «Дальше» заперто, запись — нет, кнопка пересборки — на стену Б.
       */
      const strategy = DEFAULT_STRATEGIES.find((item) => item.key === 'optimal')!;
      const requirements = { ...withStrategy(DEMO_REQUIREMENTS, strategy), cornerSolution: 'false_panel' as const, corners: [blind, blind] };
      const segment = layout.segments[1];
      const corner = cornerOfSegment([blind, blind], 1, 3);
      const old = buildRun({
        id: 'ws-1',
        lengthMm: segment.wallLengthMm - cornerGeometry(blind, 'kitchen', SIX).lostMm,
        ceilingHeightMm: 2700,
        requirements: { ...requirements, appliances: segment.appliances },
        openings: segment.openings,
        comms: segment.comms,
        corner,
        production: SIX,
        wallId: segment.wallId,
      });
      const edited = buildObject({ ...SPECS[2], production: SIX, edits: { [segment.wallId]: old } });
      const shown = edited.engine.segments[1];
      const mismatches = cornerClashMismatches({
        runs: edited.engine.segments,
        places: edited.engine.places,
        production: SIX,
        edited: (index) => index === 1,
        composed: edited.engine.layout?.cornerClashes,
      });
      const lengthMismatches = wallMismatches(edited.engine.layout, edited.engine.segments);
      const state = screenState({
        refusal: null,
        mismatches: [...lengthMismatches, ...mismatches],
        walls: edited.engine.segments.map((run) => ({ lengthMm: run.lengthMm })),
        segments: edited.engine.segments,
        shape: 'u_shape',
        warnings: [],
      });
      const text = mismatches[0] ? wallMismatchMessage(mismatches[0]) : '';
      check(
        'SA.7 правленый ряд держит свою панель: мебель на месте, расхождения длины нет, заход назван блокирующим с мм и нужной панелью; цены нет, «Дальше» заперто, запись — нет, пересобрать — стену Б',
        JSON.stringify(shown.modules.map((unit) => [unit.offsetMm, unit.widthMm])) === JSON.stringify(old.modules.map((unit) => [unit.offsetMm, unit.widthMm])) &&
          !shown.corner?.end?.clearance &&
          lengthMismatches.length === 0 &&
          mismatches.length === 1 &&
          mismatches[0].index === 1 &&
          text.includes('на 12 мм') &&
          /* F9: панель, которая развела бы заход, — 14 мм (фронт ящика — деталь «ширина − зазор»). */
          text.includes('у слепого модуля 14 мм') &&
          text.includes('пересоберите эту стену') &&
          mismatchPriceText(mismatches[0]).startsWith('Цены нет') &&
          state.priceHidden &&
          state.nextLocked &&
          !state.autosaveLocked &&
          state.rebuildWall === 1,
        `расхождений длины ${lengthMismatches.length} · заходов ${mismatches.length} · ${text.slice(0, 200)} · цена ${state.priceHidden ? 'спрятана' : 'ЕСТЬ'} · запись ${state.autosaveLocked ? 'ЗАПЕРТА' : 'идёт'} · пересобрать ${state.rebuildWall}`,
      );

      /* Смена угла карточкой не уносит панель прежнего угла: у Г-модуля своей панели владельца нет. */
      const change = changeCorner({
        runs: object.engine.segments,
        index: 1,
        next: { lower: 'l_shape', upper: 'blind' },
        corners: layout.corners.map((join) => join.choice),
        requirements,
        wallOpenings: [[], [], []],
        labels: ['Стена А', 'Стена Б', 'Стена В'],
      });
      const changedSweep = change.ok
        ? sweepClashes(change.runs, runPlacements({ runs: change.runs, corners: change.corners, zone: 'kitchen', production: SIX }), SIX).found.filter(
            (x) => (x.wall === 1 && x.other === 2) || (x.wall === 2 && x.other === 1),
          )
        : [];
      const cards = cornerCards({
        runs: object.engine.segments,
        index: 1,
        corners: layout.corners.map((join) => join.choice),
        requirements,
        wallOpenings: [[], [], []],
        labels: ['Стена А', 'Стена Б', 'Стена В'],
      });
      check(
        'SA.7 смена угла карточкой не уносит панель прежнего угла: у карточек — только вид угла; Г-модулю панель владельца не переходит; после смены у угла заходов нет, иначе — отказ словами',
        cards.length > 0 &&
          cards.every((card) => !card.choice.clearance) &&
          (change.ok ? change.corners[1].clearance?.ownerMm === undefined && changedSweep.length === 0 : change.why.length > 0 && !/undefined|NaN/.test(change.why)),
        change.ok ? `угол ${JSON.stringify(change.corners[1])} · заходов у угла ${changedSweep.length}${changedSweep.length ? `: ${fmt(changedSweep)}` : ''}` : `отказ: ${change.why}`,
      );
    }

    /*
     * ПАНЕЛЬ ПО ХОДУ ДОЕХАЛА ДО ДЕНЕГ И ДО ЛИСТА. Смета берёт фасады и кромку
     * из деталировки той же стены (`panelMaterials`), карта раскроя — из
     * деталей объекта (`objectPanels`): у обоих случаев панель есть в обеих, с
     * той же шириной, и лежит на листе (лист 2800 × 2070 для её группы).
     */
    {
      const cases = [
        { title: 'стена В П смешанной («угол 60/1000»)', spec: { key: 'u-mixed', title: 'П 2800 + 3600 + 2800 смешанная', lengths: [2800, 3600, 2800], shape: 'u_shape' as const, corners: [{ lower: 'l_shape', upper: 'empty' }, { lower: 'blind', upper: 'l_shape' }] as CornerChoice[], production: MIXED60, wallId: 'w1' }, wall: 2, name: CORNER_FILLER_PANEL_NAME, width: 64 - MIXED60.frontGapMm },
        { title: 'стена Б П 3800 + 2400 + 1740 (600/300)', spec: { ...SPECS[2], production: SIX }, wall: 1, name: CORNER_OWNER_FILLER_PANEL_NAME, width: 14 - SIX.frontGapMm },
      ];
      const drift: string[] = [];
      for (const item of cases) {
        const object = buildObject(item.spec);
        const production = item.spec.production;
        const run = object.engine.segments[item.wall];
        const panels = buildPanels({ run, production });
        const filler = panels.find((panel) => panel.name === item.name);
        const estimate = buildEstimate(run, 'optimal', DEMO_RATES, [], undefined, production, undefined, new Map(), new Map(), new Map());
        const cut = panelMaterials(panels);
        const front = estimate.lines.find((line) => line.key === 'front_panel');
        const edge = estimate.lines.find((line) => line.key === 'pvc_edge');
        const parts = objectPanels({
          walls: object.engine.segments.map((segment, i) => ({ wallId: segment.wallId ?? `w${i + 1}`, label: `Стена ${'АБВ'[i]}`, run: segment })),
          production,
        });
        const part = parts.find((p) => p.name === item.name && p.wallId === run.wallId);
        const plan = part
          ? cuttingPlan({
              parts,
              settings: { kerfMm: 4, trimMm: 10, minRemnantMm: 300, rotate: true, texture: {}, confirmed: true, sheets: [{ stock: stockBaseKey(part.stock.kind, part.thicknessMm), lengthMm: 2800, widthMm: 2070 }] },
              fingerprint: object.engine.layout!.fingerprint,
            })
          : null;
        const group = plan?.groups.find((g) => g.pieces.some((piece) => piece.part === part));
        const placed = Boolean(group && group.sheets.some((sheet) => sheet.placements.some((placement) => placement.piece.part === part)));
        const ok =
          Boolean(filler) &&
          filler!.widthMm === item.width &&
          Boolean(front && Math.abs(front.quantity - cut.frontM2) < 0.005) &&
          Boolean(edge && Math.abs(edge.quantity - cut.edgeM) < 0.005) &&
          Boolean(part) &&
          part!.widthMm === item.width &&
          placed;
        if (!ok) {
          drift.push(
            `${item.title}: деталь ${filler ? `${filler.lengthMm}×${filler.widthMm}` : 'НЕТ'} при ${item.width} · фасады сметы ${front?.quantity ?? 'НЕТ'} при раскрое ${cut.frontM2} · кромка ${edge?.quantity ?? 'НЕТ'} при ${cut.edgeM} · в карте ${part ? (placed ? 'на листе' : 'НЕ НА ЛИСТЕ') : 'НЕТ'}`,
          );
        }
      }
      check(
        'SA.7 панель по ходу доехала до денег и до листа: деталь той ширины в деталировке, фасады и кромка сметы = раскрой, деталь лежит на листе карты раскроя — у обоих случаев',
        drift.length === 0,
        drift.length === 0 ? 'стена В · стена Б — сходится' : drift.join(' | '),
      );
    }

    /* Г-модуль: заход 0,2 мм — ряд отходит на 1 мм, и это зазор, а не деталь в 1 мм. */
    {
      const object = buildObject({ key: 'l-module', title: 'Г 3400 + 2600, Г-модуль', lengths: [3400, 2600], shape: 'corner_l', corners: [{ lower: 'l_shape', upper: 'blind' }] });
      const layout = object.engine.layout!;
      const dock = object.engine.segments[1];
      const { found } = sweepClashes(object.engine.segments, object.engine.places, DEFAULT_PRODUCTION);
      const why = (layout.corners[0]?.clearanceWhy ?? []).join(' | ');
      check(
        'SA.7 Г 3400 + 2600 с Г-модулем: заход 0,2 мм — ряд Б отходит на 1 мм; полоса не шире зазора между фасадами — детали нет ни в раскрое, ни в сцене, и это сказано словами',
        layout.corners[0]?.choice.clearance?.dockMm === 1 &&
          !cornerFillersOf(dock).some((piece) => piece.level === 'lower') &&
          !buildPanels({ run: dock, production: DEFAULT_PRODUCTION }).some((panel) => panel.name === CORNER_FILLER_PANEL_NAME) &&
          found.length === 0 &&
          why.includes('без детали'),
        `зазор ${layout.corners[0]?.choice.clearance?.dockMm ?? 'нет'} · полос ${cornerFillersOf(dock).length} · заходов ${found.length} · ${why.slice(0, 160)}`,
      );
    }

    /* П с Г-модулями: верхний Г-фасад и ручка двери Б — полоса навесного ряда 22 мм, деталь в раскрое. */
    {
      const object = buildObject(SPECS[3]);
      const layout = object.engine.layout!;
      const dock = object.engine.segments[1];
      const part = buildPanels({ run: dock, production: DEFAULT_PRODUCTION }).find((panel) => panel.name === CORNER_UPPER_FILLER_PANEL_NAME);
      check(
        'SA.7 П 3600 + 2800 + 3600 с Г-модулями: верхний Г-фасад на ходу задевал ручку двери стены Б на 7,8 мм — полоса навесного ряда 22 мм, деталь 18 мм в раскрое',
        layout.corners[0]?.choice.clearance?.upperDockMm === 22 && part?.widthMm === 22 - DEFAULT_PRODUCTION.frontGapMm,
        `полоса ${layout.corners[0]?.choice.clearance?.upperDockMm ?? 'нет'} · деталь ${part?.widthMm ?? 'НЕТ'}`,
      );
    }

    /*
     * Заход, который панелью не снять: П 3600 + 2800 + 3600 со слепыми углами —
     * створка навесного шкафа стены А упирается в пенал холодильника стены Б.
     * Композиция собрана, ряды на экране, заход назван словами; цена спрятана,
     * «Дальше» заперто, запись — нет, кнопки пересборки нет (ряд и так шаблона).
     */
    {
      const object = buildObject({ key: 'u-tall', title: 'П 3600 + 2800 + 3600, слепые', lengths: [3600, 2800, 3600], shape: 'u_shape', corners: [blind, blind] });
      const layout = object.engine.layout!;
      const notes = layout.cornerClashes ?? [];
      const { found } = sweepClashes(object.engine.segments, object.engine.places, DEFAULT_PRODUCTION);
      const told = (x: Sweep) => notes.some((note) => note.wall === x.wall && note.obstacleWall === x.other && note.leaf === x.leaf);
      const mismatches = cornerClashMismatches({
        runs: object.engine.segments,
        places: object.engine.places,
        production: DEFAULT_PRODUCTION,
        edited: () => false,
        composed: notes,
      });
      const state = screenState({
        refusal: null,
        mismatches,
        walls: object.engine.segments.map((run) => ({ lengthMm: run.lengthMm })),
        segments: object.engine.segments,
        shape: 'u_shape',
        warnings: [],
      });
      const text = mismatches[0] ? wallMismatchMessage(mismatches[0]) : '';
      check(
        'SA.7 П 3600 + 2800 + 3600 (слепые, 560/320): заход, который панелью не снять, назван словами — нужная панель шире 100 мм; каждый заход своего счёта назван; цены нет, «Дальше» заперто, запись идёт, пересборки нет',
        notes.length > 0 &&
          found.length > 0 &&
          found.every(told) &&
          notes.every((note) => note.words.includes('шире 100 мм') && !/undefined|NaN/.test(note.words)) &&
          mismatches.length > 0 &&
          text.includes('выберите в этом углу другое решение') &&
          state.priceHidden &&
          state.nextLocked &&
          !state.autosaveLocked &&
          state.rebuildWall === null &&
          state.exportLocked,
        `названо ${notes.length}: ${notes[0]?.words.slice(0, 160) ?? 'НИЧЕГО'} · своим счётом ${found.length}, не названо ${found.filter((x) => !told(x)).length} · цена ${state.priceHidden ? 'спрятана' : 'ЕСТЬ'} · запись ${state.autosaveLocked ? 'ЗАПЕРТА' : 'идёт'} · пересобрать ${state.rebuildWall}`,
      );
    }

    /*
     * Решение, которое заход не уменьшило, отброшено: у П 3600 + 2800 + 3600 на
     * 550/350 и 600/300 панель владельца у угла Б — В духовой шкаф в другом
     * конце ряда Б не уводит. Без отбрасывания у угла оставалась бы панель
     * 72 и 92 мм, которая ничего не разводит, — деталь без причины.
     */
    {
      const left: string[] = [];
      for (const [school, production] of SCHOOLS.slice(1)) {
        const object = buildObject({ key: 'u-tall', title: 'П 3600 + 2800 + 3600, слепые', lengths: [3600, 2800, 3600], shape: 'u_shape', corners: [blind, blind], production });
        const layout = object.engine.layout!;
        const named = (layout.cornerClashes ?? []).some((note) => note.corner === 1);
        if (layout.corners[1]?.choice.clearance || !named) {
          left.push(`${school}: у угла Б — В ${JSON.stringify(layout.corners[1]?.choice.clearance ?? null)}, заход ${named ? 'назван' : 'НЕ НАЗВАН'}`);
        }
      }
      check(
        'SA.7 решение, не уменьшившее заход, отброшено: у П 3600 + 2800 + 3600 (550/350, 600/300) у угла Б — В панели без причины нет, заход назван',
        left.length === 0,
        left.length === 0 ? 'панелей без причины 0' : left.join(' | '),
      );
    }

    /*
     * Комната раздела u-shape демонстрации до STAGE A — 3600 × 3000: у П
     * пеналы на средней стене у угла, створка навесного слепого шкафа А на
     * ходу заходит в пенал холодильника. Блокирующее словами; то, что слова
     * советуют, — правда: «пустой верх» у угла А — Б и Г-модули его снимают.
     */
    {
      const room = (corners: CornerChoice[]) =>
        buildObject({ key: 'u-demo', title: 'П 3600 + 3000 + 3600', lengths: [3600, 3000, 3600], shape: 'u_shape', corners }).engine.layout!;
      const blocked = room([blind, blind]);
      const empty = room([{ lower: 'blind', upper: 'empty' }, blind]);
      const lmod = room([
        { lower: 'l_shape', upper: 'l_shape' },
        { lower: 'l_shape', upper: 'l_shape' },
      ]);
      const notes = blocked.cornerClashes ?? [];
      /*
       * F9 (2026-10-31): до правки здесь стояло «Г-модули снимают заход — 0».
       * Сцена рисовала створки на зазор меньше деталей, и ход у угла мерил не
       * ту мебель. По настоящим деталям у Г-модулей два захода: Г-фасад
       * верхнего угла — в ручку «Дверцы» стены Б (её полотно выше на 2 мм
       * сверху, ручка с ним), дверь холодильника стены Б — в фасад Г-модуля
       * (фасад встройки режется «ширина − зазор»). Оба — блокирующее словами:
       * фальш-панель шире сняла бы, но места под неё нет.
       */
      const lmodNotes = lmod.cornerClashes ?? [];
      check(
        'SA.7 П 3600 + 3000 + 3600 (комната демонстрации до STAGE A): заход у угла А — Б назван блокирующим; «пустой верх» у этого угла его снимает — заходов 0; Г-модули по настоящим деталям — два захода у угла А — Б (ручка «Дверцы» 7,8 мм, фасад Г-модуля 0,3 мм), оба словами, панели нет места',
        notes.length > 0 &&
          notes.every((note) => note.corner === 0 && note.words.includes('Холодильник')) &&
          (empty.cornerClashes ?? []).length === 0 &&
          lmodNotes.length === 2 &&
          lmodNotes.every((note) => note.corner === 0 && note.words.includes('места под неё нет')) &&
          lmodNotes.some((note) => note.words.includes('в ручку модуля «Дверца»') && note.words.includes('7,8 мм')) &&
          lmodNotes.some((note) => note.words.includes('Холодильник') && note.words.includes('0,3 мм')),
        `слепые: ${notes.length} (${notes[0]?.words.slice(0, 120) ?? 'НЕТ'}) · пустой верх: ${(empty.cornerClashes ?? []).length} · Г-модули: ${lmodNotes.length} (${lmodNotes.map((n) => n.words.slice(0, 90)).join(' | ')})`,
      );
    }

    /* П директивы: замер не меняется — нужный размер, допустимость мельче шкафами и варианты словами. */
    {
      const directive = compositionAttemptOf(U_DIRECTIVE);
      const reason = directive?.state === 'refused' ? directive.reason : '';
      check(
        'SA.7 П 3800 + 1140 + 1740: стена Б не меняется — сказано, сколько нужно рабочей П (не короче 2352 мм), можно ли мельче шкафами и что делать',
        reason.includes('не короче 2352 мм') && reason.includes('Мельче шкафами не выйти') && reason.includes('Что можно:') && !/Error|undefined|NaN/.test(reason),
        reason || 'ОТКАЗА НЕТ',
      );
    }
  }
}

/* Отдельный запуск — свой счёт. */
const direct = process.argv[1] && /verify-stage-a\.ts$/.test(process.argv[1]);
if (direct) {
  let passed = 0;
  let failed = 0;
  stageAChecks((name, condition, detail) => {
    if (condition) passed += 1;
    else failed += 1;
    console.log(`${condition ? '✓' : '✗'} ${name}${detail ? `\n    ${detail}` : ''}`);
  });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
