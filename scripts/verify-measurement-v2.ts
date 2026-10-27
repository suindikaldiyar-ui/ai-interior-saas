/**
 * ПРИЁМКА MEASUREMENT 2.0 — ЗАМЕР, ОБХОД, СТОРОНА КУХНИ.
 * Входит в `test:millwork`; отдельно —
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-measurement-v2.ts`.
 *
 * Путь экрана — `measurement-v2-fixture.ts` (`buildFromSurvey`): замер →
 * `resolveSurvey` → `objectSite` → `compositionFor` → стена А из вариантов →
 * соседние стены → места рядов в мире → комната вокруг рядов.
 *
 * Главная мера — сторона кухни по физическим точкам: знак угла «дальний
 * конец А → угол → дальний конец Б» на плане замера и в мире один и тот же.
 * Разный — кухня зеркальна замеру (так было у обхода «налево» до 2.0).
 *
 *   M2.1  Г в четырёх положениях: одна кухня, план повёрнут как плитка, сторона одна;
 *   M2.2  Г 2360 + 2540 обходом налево (объект заказчика) — кухня по замеру, а не в зеркале;
 *   M2.3  прежний замер с поворотом налево не меняется без человека и назван (`legacyMirrored`);
 *   M2.4  П в двух зеркальных положениях; M2.5 повороты вправо и влево;
 *   M2.6  отражение: дважды — тот же замер, привязка от угла та же; M2.7 сторона комнаты;
 *   M2.8  размеры, тот же обход в обратную сторону и с другой стены; M2.9 сохранение;
 *   M2.10 стена без длины рвёт цепочку словами; M2.11 идентификатор стены не повторяется;
 *   M2.12 комната с выступом: стена за выступом поворачивает в другую сторону;
 *   M2.13 прежний замер с поворотами направо и замер 2.0 — одна и та же мебель;
 *   M2.14 цепочка у незамкнутого обхода; M2.15 план Studio (`RoomPlan`) против
 *         мира: мебель, проёмы и точки от левого угла и с той стороны; M2.16 план
 *         шага замера (`SurveyPlan`); M2.17 начало ряда у угла с владельцем
 *         «следующая стена»; M2.18 П в четырёх положениях.
 *   M2.19–M2.23 отражение мебели, прежний замер, точная отметка, модуль на другую стену;
 *   M2.24–M2.28 антресоли: до потолка с зазором цеха, в линию с высоким блоком, углы;
 *   M2.29–M2.31 три эталонные кухни владельца: состав и отметки по фото, смета с
 *         каталогом материалов организации (фасады без цены — словами), деталировка
 *         антресолей = нарисованное, запись и открытие без изменения геометрии;
 *   M2.32 «Соединить в углу»: антресоль переходит к другой стене карточкой угла без пересборки стен.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MillworkOp, Module, Run, SavedCornerChoice } from '../types/millwork';
import type { MillworkState } from '../lib/projects';
import { measured, resolveSurvey, valueOf, type Survey, type SurveyComm, type SurveyOpening } from '../types/survey';
import RoomPlan from '../components/millwork/studio/RoomPlan';
import SurveyPlan from '../components/millwork/SurveyPlan';
import { buildRun } from '../lib/millwork/layout';
import { DEFAULT_REQUIREMENTS } from '../lib/millwork/workspace';
import { DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { projectOffer } from '../lib/millwork/objectEstimate';
import { applyOps } from '../lib/millwork/ops';
import { mirroredState, type MirrorContext } from '../lib/millwork/mirror';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import { runBoxesByModule, runPlaces } from '../lib/millwork/cabinetBoxes';
import { hasFacade } from '../lib/millwork/applianceFront';
import { productionFor } from '../lib/millwork/shop';
import { cornerGeometry, levelBoundsOf, lowerGapMm } from '../lib/millwork/corner';
import { mezzanineBaseOf, tallStorageOf } from '../lib/millwork/fill';
import { clashWords, cornerKinematics, formatMm } from '../lib/millwork/cornerKinematics';
import { buildPanels } from '../lib/millwork/panels';
import { unpricedLines } from '../lib/millwork/estimate';
import { wallFurnitureOf } from '../lib/millwork/wallLength';
import {
  L_TILES,
  U_TILES,
  canonicalWalk,
  honoredWalk,
  kitchenChain,
  legacyMirrored,
  legacyWalkOf,
  mirroredSurvey,
  nextWallId,
  reversedWalk,
  startedAt,
  tileSurvey,
  withTurn,
  withoutWall,
} from '../lib/millwork/roomWalk';
import { surveyWalk } from '../lib/millwork/surveyPlan';
import { buildFromSurvey, hitsOf, levelOf, planCorner, rowToWorld, surveyOf, turnSign, worldCorner, type Built } from './measurement-v2-fixture';
import {
  KITCHEN_CATALOG,
  KITCHEN_MATERIAL_ITEMS,
  KITCHEN_MATERIALS,
  kitchenState,
  mezzOf,
  referenceKitchens,
  storesOf,
  tallBlockOf,
  uppersOf,
  type ReferenceKitchen,
} from './measurement-v2-kitchens';

type Check = (name: string, condition: boolean, detail?: string) => void;

const BASE: Survey = surveyOf([]);

/** Модули стен в мире — для сравнения «та же мебель». */
function furniture(built: Built): string {
  return JSON.stringify(built.rows.map((row) => [row.wallId, row.lengthMm, row.modules.map((m) => [m.kind, m.min, m.max])]));
}

/** Сторона на плане и в мире по углу стен `a`–`b`. */
function sides(built: Built, survey: Survey, a: string, b: string) {
  if (!built.room) throw new Error(`${built.title}: комнаты нет`);
  return { plan: turnSign(planCorner(survey, a, b)), world: turnSign(worldCorner(built.room, a, b)) };
}

/* ─────────────────────────  План, как его рисует экран  ───────────────────────── */

type P = { x: number; y: number };

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of Array.from(tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g))) out[m[1]] = m[2];
  return out;
}

function pointsOf(value: string | undefined): P[] {
  if (!value) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: у многоугольника нет точек');
  return value
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    });
}

/**
 * План Studio — ТЕМ ЖЕ компонентом, что на экране (`RoomPlan` в Node), и с
 * той же мебелью на стенах (`wallFurnitureOf`, как у рабочего места).
 */
function studioPlan(built: Built, survey: Survey) {
  const furniture = wallFurnitureOf({
    runs: built.segments,
    layout: built.layout,
    runWallId: built.runWallId,
    edited: () => false,
    free: false,
  }).map(({ wallId, run, startMm }) => ({ wallId, run, startMm }));
  const svg = renderToStaticMarkup(
    createElement(RoomPlan, { survey, selectedWallId: null, onSelectWall: () => {}, furniture, selectedModuleId: null }),
  );
  const modules = new Map<string, P[]>();
  for (const m of Array.from(svg.matchAll(/<polygon\b[^>]*>/g))) {
    const a = attrsOf(m[0]);
    if (a['data-plan-module']) modules.set(a['data-plan-module'], pointsOf(a.points));
  }
  const openings = new Map<string, P[]>();
  for (const m of Array.from(svg.matchAll(/<g\b[^>]*data-plan-opening="([^"]+)"[^>]*>\s*<polygon\b([^>]*)>/g))) {
    openings.set(m[1], pointsOf(attrsOf(m[2]).points));
  }
  const comms = new Map<string, P>();
  for (const m of Array.from(svg.matchAll(/<g\b[^>]*data-plan-comm="([^"]+)"[^>]*>\s*<circle\b([^>]*)>/g))) {
    const a = attrsOf(m[2]);
    comms.set(m[1], { x: Number(a.cx), y: Number(a.cy) });
  }
  return { modules, openings, comms };
}

/** Вдоль стены от угла (`corner` → `far`), мм; и насколько точка в стороне от её линии. */
function along(corner: P, far: P, p: P): { t: number; off: number } {
  const len = Math.hypot(far.x - corner.x, far.y - corner.y);
  const ux = (far.x - corner.x) / len;
  const uy = (far.y - corner.y) / len;
  return { t: (p.x - corner.x) * ux + (p.y - corner.y) * uy, off: (p.x - corner.x) * uy - (p.y - corner.y) * ux };
}

const span = (ts: number[]) => [Math.min(...ts), Math.max(...ts)] as [number, number];

/**
 * МЕБЕЛЬ, ПРОЁМЫ И ТОЧКИ НА ПЛАНЕ STUDIO ПРОТИВ МИРА — у каждого угла цепочки.
 *
 * Для каждого модуля обеих стен угла: его отрезок вдоль стены от угла на
 * плане (как нарисовал `RoomPlan`) и в мире (габарит модуля на полу против
 * той же стены комнаты) — одни и те же миллиметры; его полоса на плане —
 * на линии своей стены и со стороны комнаты (там же, где дальний конец
 * соседней стены). Проёмы — так же; точки коммуникаций — на своём
 * расстоянии от ЛЕВОГО угла стены (стоя лицом к ней): у первой стены угла
 * по часовой это дальний конец, у второй — сам угол.
 */
function planAgainstWorld(built: Built, survey: Survey) {
  if (!built.room) throw new Error(`${built.title}: комнаты нет`);
  const room = built.room;
  const plan = studioPlan(built, survey);
  const rotation = survey.planRotationDeg ?? 0;
  const bad: string[] = [];
  /* Стена Б у П — в двух углах: меряется от обоих, а считается один раз. */
  const modules = new Set<string>();
  const openings = new Set<string>();
  let comms = 0;
  const seenComms = new Set<string>();
  for (let k = 0; k + 1 < built.chain.length; k += 1) {
    const idA = built.chain[k];
    const idB = built.chain[k + 1];
    const pc = planCorner(survey, idA, idB, rotation);
    const wc = worldCorner(room, idA, idB);
    const sides: [string, P, P, P][] = [
      [idA, pc.far, wc.far, pc.farB],
      [idB, pc.farB, wc.farB, pc.far],
    ];
    for (const [wallId, planFar, worldFar, planOther] of sides) {
      const row = built.rows.find((item) => item.wallId === wallId);
      if (!row) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ${built.title}: ряда стены ${wallId} нет`);
      const inside = Math.sign(along(pc.corner, planFar, planOther).off);
      for (const unit of row.modules) {
        const poly = plan.modules.get(unit.id);
        if (!poly) {
          bad.push(`${wallId} ${unit.id}: на плане нет`);
          continue;
        }
        modules.add(unit.id);
        const onPlan = span([along(pc.corner, planFar, poly[0]).t, along(pc.corner, planFar, poly[1]).t]);
        const footprint: P[] = [
          { x: unit.min[0], y: unit.min[1] },
          { x: unit.max[0], y: unit.min[1] },
          { x: unit.min[0], y: unit.max[1] },
          { x: unit.max[0], y: unit.max[1] },
        ];
        const inWorld = span(footprint.map((point) => along(wc.corner, worldFar, point).t));
        const onLine = Math.max(Math.abs(along(pc.corner, planFar, poly[0]).off), Math.abs(along(pc.corner, planFar, poly[1]).off));
        const side = Math.sign(along(pc.corner, planFar, poly[2]).off);
        if (Math.abs(onPlan[0] - inWorld[0]) > 1 || Math.abs(onPlan[1] - inWorld[1]) > 1 || onLine > 1 || side !== inside) {
          bad.push(
            `${wallId} ${unit.id}: план ${onPlan.map(Math.round).join('…')} · мир ${inWorld.map(Math.round).join('…')} · от линии ${Math.round(onLine)} · ${side === inside ? 'в комнате' : 'НАРУЖУ'}`,
          );
        }
      }
      const wall = room.walls.find((item) => item.id === wallId);
      if (!wall) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ${built.title}: стены ${wallId} в комнате нет`);
      for (const object of room.objects.filter((item) => item.wallId === wallId)) {
        const poly = plan.openings.get(object.id);
        if (!poly) {
          bad.push(`${wallId} проём ${object.id}: на плане нет`);
          continue;
        }
        openings.add(object.id);
        const onPlan = span([along(pc.corner, planFar, poly[0]).t, along(pc.corner, planFar, poly[1]).t]);
        const at = (mm: number): P => ({ x: wall.startMm[0] + wall.dir[0] * mm, y: wall.startMm[1] + wall.dir[1] * mm });
        const inWorld = span([along(wc.corner, worldFar, at(object.fromMm)).t, along(wc.corner, worldFar, at(object.fromMm + object.widthMm)).t]);
        if (Math.abs(onPlan[0] - inWorld[0]) > 1 || Math.abs(onPlan[1] - inWorld[1]) > 1) {
          bad.push(`${wallId} проём ${object.id}: план ${onPlan.map(Math.round).join('…')} · мир ${inWorld.map(Math.round).join('…')}`);
        }
      }
      for (const comm of survey.comms.filter((item) => item.wallId === wallId && !seenComms.has(item.id))) {
        seenComms.add(comm.id);
        const point = plan.comms.get(comm.id);
        if (!point) {
          bad.push(`${wallId} точка ${comm.id}: на плане нет`);
          continue;
        }
        comms += 1;
        /* Левый угол стены по часовой: у первой стены угла — дальний конец, у второй — сам угол. */
        const t = along(pc.corner, planFar, point).t;
        const fromLeft = wallId === idA ? wall.lengthMm - t : t;
        if (Math.abs(fromLeft - (valueOf(comm.fromCornerMm) ?? -1)) > 1) {
          bad.push(`${wallId} точка ${comm.id}: от левого угла ${Math.round(fromLeft)} при замере ${valueOf(comm.fromCornerMm)}`);
        }
      }
    }
  }
  return { bad, modules: modules.size, openings: openings.size, comms };
}

/**
 * План шага замера (`SurveyPlan`) — ТЕМ ЖЕ компонентом. Предварительный ряд
 * — та же `buildRun`, что у панели замера. Левый угол стены ряда находится
 * физически: со стороны комнаты (там, где дальний конец соседней стены),
 * лицом к стене — левый конец.
 */
function surveyStepPlan(survey: Survey, otherWallId: string) {
  const resolution = resolveSurvey(survey);
  const runWall = resolution.measurement.walls.find((w) => w.id === resolution.runWallId);
  if (!runWall) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: стены ряда в замере нет');
  const run: Run = buildRun({
    lengthMm: runWall.lengthMm,
    ceilingHeightMm: resolution.measurement.ceilingHeightMm,
    requirements: DEFAULT_REQUIREMENTS,
    openings: runWall.openings,
    comms: resolution.measurement.comms.filter((c) => c.wallId === runWall.id),
  });
  const svg = renderToStaticMarkup(createElement(SurveyPlan, { survey, modules: run.modules, runWallId: resolution.runWallId }));
  const wallLine = (id: string): [P, P] => {
    const m = svg.match(new RegExp(`<g\\b[^>]*data-survey-wall="${id}"[^>]*>\\s*<line\\b([^>]*)>`));
    if (!m) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: стены ${id} на плане замера нет`);
    const a = attrsOf(m[1]);
    return [
      { x: Number(a.x1), y: Number(a.y1) },
      { x: Number(a.x2), y: Number(a.y2) },
    ];
  };
  const [p, q] = wallLine(resolution.runWallId);
  const [o1, o2] = wallLine(otherWallId);
  const near = (u: P, v: P) => Math.hypot(u.x - v.x, u.y - v.y) < 0.5;
  const corner = near(p, o1) || near(p, o2) ? p : q;
  const otherFar = near(corner, o1) ? o2 : o1;
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const u = { x: q.x - p.x, y: q.y - p.y };
  let n = { x: -u.y, y: u.x };
  if (n.x * (otherFar.x - corner.x) + n.y * (otherFar.y - corner.y) < 0) n = { x: -n.x, y: -n.y };
  /* Лицом к стене из комнаты — взгляд против нормали; левая рука — (f.y, −f.x) при оси Y вниз. */
  const f = { x: -n.x, y: -n.y };
  const left = { x: f.y, y: -f.x };
  const leftEnd = (p.x - mid.x) * left.x + (p.y - mid.y) * left.y > (q.x - mid.x) * left.x + (q.y - mid.y) * left.y ? p : q;
  const rightEnd = leftEnd === p ? q : p;
  const scale = Math.hypot(u.x, u.y) / runWall.lengthMm;
  const fromLeft = (point: P) => along(leftEnd, rightEnd, point).t / scale;
  const polys: { id: string; offsetMm: number; widthMm: number; poly: P[] }[] = [];
  for (const m of Array.from(svg.matchAll(/<polygon\b[^>]*>/g))) {
    const a = attrsOf(m[0]);
    const unit = run.modules.find((item) => item.id === a['data-survey-module']);
    if (unit) polys.push({ id: unit.id, offsetMm: unit.offsetMm, widthMm: unit.widthMm, poly: pointsOf(a.points) });
  }
  const openingSpots = Array.from(svg.matchAll(/<g\b[^>]*data-survey-opening="([^"]+)"[^>]*>\s*<line\b([^>]*)>/g)).map((m) => {
    const a = attrsOf(m[2]);
    return { id: m[1], a: { x: Number(a.x1), y: Number(a.y1) }, b: { x: Number(a.x2), y: Number(a.y2) } };
  });
  const bad: string[] = [];
  for (const item of polys) {
    const got = span([fromLeft(item.poly[0]), fromLeft(item.poly[1])]);
    const inward = (item.poly[2].x - item.poly[1].x) * n.x + (item.poly[2].y - item.poly[1].y) * n.y;
    if (Math.abs(got[0] - item.offsetMm) > 2 || Math.abs(got[1] - (item.offsetMm + item.widthMm)) > 2 || inward <= 0) {
      bad.push(`${item.id}: от левого угла ${got.map(Math.round).join('…')} при ${item.offsetMm}…${item.offsetMm + item.widthMm}, полоса ${inward > 0 ? 'в комнате' : 'СНАРУЖИ'}`);
    }
  }
  let openings = 0;
  for (const spot of openingSpots) {
    const opening = runWall.openings.find((item) => item.id === spot.id);
    if (!opening) continue;
    openings += 1;
    const got = span([fromLeft(spot.a), fromLeft(spot.b)]);
    if (Math.abs(got[0] - opening.fromCornerMm) > 2 || Math.abs(got[1] - (opening.fromCornerMm + opening.widthMm)) > 2) {
      bad.push(`проём ${spot.id}: от левого угла ${got.map(Math.round).join('…')} при ${opening.fromCornerMm}…${opening.fromCornerMm + opening.widthMm}`);
    }
  }
  return { bad, modules: polys.length, openings };
}

/* ─────────────────────────  Мебель в зеркале  ───────────────────────── */

/**
 * ЧТО У МОДУЛЯ ОТНОСИТЕЛЬНО УГЛА — ФИЗИЧЕСКИЕ МЕРЫ, А НЕ ОТМЕТКИ РЯДА.
 *
 * Отражение меняет отметки и стороны, но не меняет физику: модуль на той же
 * стене в тех же миллиметрах от угла, петли той створки, что была у угла,
 * — у угла, свой фасад створки — на той же створке по месту. Меряется в
 * мире (места рядов `runPlacements`), у угла стен цепочки.
 */
type Physical = {
  /** id → «стена · от угла … до … · петли у угла / дальше». */
  modules: Map<string, string>;
  /** Свои фасады створок: «модуль · от угла … до … · цвет». */
  leaves: string[];
};

function physicalOf(built: Built, cornerWalls: [string, string]): Physical {
  if (!built.room) throw new Error(`${built.title}: комнаты нет`);
  const wc = worldCorner(built.room, cornerWalls[0], cornerWalls[1]);
  const modules = new Map<string, string>();
  const leaves: string[] = [];
  built.segments.forEach((run, i) => {
    const wallId = run.wallId ?? '';
    const far = wallId === cornerWalls[0] ? wc.far : wallId === cornerWalls[1] ? wc.farB : null;
    if (!far) return;
    const place = built.places[i];
    const fromCorner = (rowMm: number) => {
      const [x, z] = rowToWorld(place, rowMm / 1000, 0);
      return Math.round(along(wc.corner, far, { x, y: z }).t);
    };
    for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
      const a = fromCorner(unit.offsetMm);
      const b = fromCorner(unit.offsetMm + unit.widthMm);
      const hinge = unit.fill?.hinge;
      const hingeEdge = hinge === 'left' ? a : hinge === 'right' ? b : null;
      const otherEdge = hinge === 'left' ? b : hinge === 'right' ? a : null;
      const hingeSide = hingeEdge === null || otherEdge === null ? '—' : Math.abs(hingeEdge) < Math.abs(otherEdge) ? 'петли у угла' : 'петли дальше';
      modules.set(unit.id, `${wallId} · ${Math.min(a, b)}…${Math.max(a, b)} · ${hingeSide}`);
      for (const [leaf, spec] of Object.entries(unit.leafFronts ?? {})) {
        const m = /^door:(\d+)$/.exec(leaf);
        if (!m || unit.doorCount < 2) continue;
        const k = Number(m[1]);
        const w = unit.widthMm / unit.doorCount;
        const la = fromCorner(unit.offsetMm + k * w);
        const lb = fromCorner(unit.offsetMm + (k + 1) * w);
        leaves.push(`${unit.id} · ${Math.min(la, lb)}…${Math.max(la, lb)} · ${spec.colorHex ?? spec.base}`);
      }
    }
  });
  return { modules, leaves: leaves.sort() };
}

/** Правки, которые отражение обязано перенести: петли с разных сторон и свой фасад одной створки. */
function editedRow(run: Run): Run {
  const singles = run.modules.filter((unit) => unit.frontType === 'door' && unit.doorCount === 1 && !unit.appliance);
  const pair = run.modules.find((unit) => unit.frontType === 'door' && unit.doorCount === 2);
  const ops: MillworkOp[] = singles.slice(0, 2).map((unit, i) => ({ op: 'set_opening', moduleId: unit.id, opening: i === 0 ? 'left' : 'right' }));
  if (pair) {
    ops.push({ op: 'set_leaf_front', moduleId: pair.id, leaf: 'door:0', front: { base: 'mdf_enamel', construct: 'solid', finish: 'matte', colorHex: '#2f5d50' } });
  }
  if (ops.length === 0) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: в ряду ${run.wallId} нечего править`);
  return applyOps({ run, requirements: DEMO_REQUIREMENTS, ops });
}

function stateOf(survey: Survey, built: Built, shape: 'corner_l' | 'u_shape', corners: SavedCornerChoice[]): MillworkState {
  const [first, ...rest] = built.segments;
  return {
    survey,
    shape,
    requirements: DEMO_REQUIREMENTS,
    corners,
    selectedVariant: 'optimal',
    runs: { optimal: editedRow(first) },
    wallRuns: Object.fromEntries(rest.map((run) => [run.wallId as string, editedRow(run)])),
  };
}

function contextOf(built: Built, survey: Survey): MirrorContext {
  return {
    chainBefore: built.chain,
    rowLengthMm: Object.fromEntries(built.segments.map((run) => [run.wallId as string, run.lengthMm])),
    wallLengthMm: Object.fromEntries(survey.walls.map((wall) => [wall.id, valueOf(wall.lengthMm) ?? 0])),
    applianceWall: (appliance) => built.layout?.segments.find((segment) => segment.appliances.includes(appliance as never))?.wallId ?? null,
  };
}

function buildState(title: string, state: MillworkState, shape: 'corner_l' | 'u_shape'): Built {
  if (!state.survey) throw new Error(`${title}: у объекта нет замера`);
  return buildFromSurvey({
    title,
    survey: state.survey,
    shape,
    corners: state.corners,
    requirements: state.requirements,
    working: state.runs?.optimal,
    editedWalls: state.wallRuns,
  });
}

function mirrorChecks(check: Check): void {
  /* M2.19 правленая Г: отражение комнаты и мебели */
  {
    const survey = surveyOf([{ length: 3600, run: true }, { length: 2800 }]);
    const corners: SavedCornerChoice[] = [{ walls: ['w1', 'w2'], lower: 'blind', upper: 'blind' }];
    const template = buildFromSurvey({ title: 'Г 3600 + 2800', survey, shape: 'corner_l', corners });
    if (template.refusal) throw new Error(`M2.19: ${template.refusal}`);
    const state = stateOf(survey, template, 'corner_l', corners);
    const before = buildState('Г правленая', state, 'corner_l');
    const flipped = mirroredSurvey(survey, before.chain);
    if ('refusal' in flipped) throw new Error(`M2.19: ${flipped.refusal}`);
    const mirrored = mirroredState({ ...state, survey: flipped.survey }, contextOf(before, survey));
    const after = buildState('Г правленая в зеркале', mirrored.state, 'corner_l');
    const back = mirroredSurvey(flipped.survey, after.chain);
    if ('refusal' in back) throw new Error(`M2.19: ${back.refusal}`);
    const twice = mirroredState({ ...mirrored.state, survey: back.survey }, contextOf(after, flipped.survey));
    const pb = physicalOf(before, ['w1', 'w2']);
    const pa = physicalOf(after, ['w2', 'w1']);
    const moved = Array.from(pb.modules).filter(([id, text]) => pa.modules.get(id) !== text);
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const s = sides(after, flipped.survey, 'w1', 'w2');
    const plan = planAgainstWorld(after, flipped.survey);
    const hinges = Array.from(pb.modules.values()).filter((text) => text.includes('петли')).length;
    check(
      'M2.19 правленая Г 3600 + 2800 и «Отразить»: цепочка наоборот (А — стена 2), каждый модуль на той же стене в тех же мм от угла, петли и свой фасад створки — на той же стороне от угла, итог тот же; план = мир, сторона одна; дважды — тот же объект',
      before.refusal === null &&
        after.refusal === null &&
        after.chain.join(',') === 'w2,w1' &&
        pb.modules.size > 10 &&
        moved.length === 0 &&
        hinges >= 4 &&
        pb.leaves.length === 2 &&
        same(pb.leaves, pa.leaves) &&
        after.total === before.total &&
        s.plan === s.world &&
        plan.bad.length === 0 &&
        same({ ...twice.state, survey: undefined }, { ...state, survey: undefined }) &&
        same(back.survey, survey),
      `модулей ${pb.modules.size}, с петлями слева/справа ${hinges}, своих фасадов ${pb.leaves.length} (${pa.leaves.join('; ')}) · не на месте ${moved.length}${moved.length ? `: ${moved.slice(0, 2).map(([id, t]) => `${id} ${t} → ${pa.modules.get(id)}`).join('; ')}` : ''} · итог ${before.total} → ${after.total} · план ${s.plan} 3D ${s.world}, план против мира ${plan.bad.length} · дважды ${same({ ...twice.state, survey: undefined }, { ...state, survey: undefined }) ? 'тот же' : 'ДРУГОЙ'} · ${mirrored.notes.join(' ')}`,
    );
  }

  /* M2.20 прежний замер «налево» (объект заказчика): перевод в 2.0 */
  {
    const legacy = surveyOf([{ length: 2360, turn: 'left', run: true }, { length: 2540, turn: 'left' }], { version: false });
    const corners: SavedCornerChoice[] = [{ walls: ['w1', 'w2'], lower: 'blind', upper: 'blind' }];
    const template = buildFromSurvey({ title: 'прежний Г налево', survey: legacy, shape: 'corner_l', corners });
    if (template.refusal) throw new Error(`M2.20: ${template.refusal}`);
    const state = stateOf(legacy, template, 'corner_l', corners);
    const before = buildState('прежний Г налево, правленый', state, 'corner_l');
    const converted = mirroredState({ ...state, survey: honoredWalk(legacy) }, contextOf(before, legacy));
    const after = buildState('тот же объект по замеру 2.0', converted.state, 'corner_l');
    const pb = physicalOf(before, ['w1', 'w2']);
    const pa = physicalOf(after, ['w2', 'w1']);
    const moved = Array.from(pb.modules).filter(([id, text]) => pa.modules.get(id) !== text);
    const sb = sides(before, legacy, 'w1', 'w2');
    const sa = sides(after, converted.state.survey!, 'w1', 'w2');
    check(
      'M2.20 прежний замер Г 2360 налево 2540 с правками (как у объекта заказчика): «Перестроить по замеру» — замер 2.0, мебель отражена: сторона кухни в 3D теперь та же, что на плане, каждый модуль в тех же мм от угла и на своей стене, петли с той же стороны от угла, итог тот же; прежний замер названо (`legacyWalkOf` = mirrored)',
      legacyWalkOf(legacy) === 'mirrored' &&
        sb.plan !== sb.world &&
        after.refusal === null &&
        after.chain.join(',') === 'w2,w1' &&
        sa.plan === sa.world &&
        moved.length === 0 &&
        pb.modules.size > 8 &&
        after.total === before.total &&
        legacyWalkOf(converted.state.survey) === null,
      `до: план ${sb.plan} 3D ${sb.world} · после: ${after.refusal ?? after.chain.join('→')}, план ${sa.plan} 3D ${sa.world} · модулей ${pb.modules.size}, не на месте ${moved.length}${moved.length ? `: ${moved.slice(0, 2).map(([id, t]) => `${id} ${t} → ${pa.modules.get(id)}`).join('; ')}` : ''} · итог ${before.total} → ${after.total}`,
    );
  }

  /* M2.20b ровно как у объекта заказчика: свободная сборка, один модуль на стене 1 */
  {
    const legacy = surveyOf([{ length: 2360, turn: 'left', run: true }, { length: 2540, turn: 'left' }], { version: false });
    const corners: SavedCornerChoice[] = [{ walls: ['w1', 'w2'], lower: 'blind', upper: 'blind' }];
    const requirements = { ...DEMO_REQUIREMENTS, mode: 'free' as const };
    const empty = buildFromSurvey({ title: 'прежний Г налево, свободная сборка', survey: legacy, shape: 'corner_l', corners, requirements });
    if (empty.refusal) throw new Error(`M2.20b: ${empty.refusal}`);
    const working = applyOps({ run: empty.segments[0], requirements, ops: [{ op: 'add_module', kind: 'base', widthMm: 600, atMm: 1600 }] });
    const state: MillworkState = { survey: legacy, shape: 'corner_l', requirements, corners, selectedVariant: 'optimal', runs: { optimal: working }, wallRuns: {} };
    const before = buildState('свободная сборка до перевода', state, 'corner_l');
    const converted = mirroredState({ ...state, survey: honoredWalk(legacy) }, contextOf(before, legacy));
    const after = buildState('свободная сборка по замеру 2.0', converted.state, 'corner_l');
    const pb = physicalOf(before, ['w1', 'w2']);
    const pa = physicalOf(after, ['w2', 'w1']);
    const modulesBefore = Array.from(pb.modules.values());
    const sa = sides(after, converted.state.survey!, 'w1', 'w2');
    check(
      'M2.20b как у объекта заказчика (свободная сборка, Г 2360 налево 2540, один модуль 600 на стене 1): после «Перестроить по замеру» модуль на стене 1 в тех же мм от угла, стена 1 по-прежнему ведёт угол (ряд 2360), стена 2 пустая — как была; сторона в 3D = план; итог тот же',
      modulesBefore.length === 1 &&
        after.refusal === null &&
        Array.from(pa.modules.values()).join() === modulesBefore.join() &&
        after.segments.find((run) => run.wallId === 'w1')?.lengthMm === 2360 &&
        (after.segments.find((run) => run.wallId === 'w2')?.modules.length ?? -1) === 0 &&
        sa.plan === sa.world &&
        after.total === before.total,
      `до: ${modulesBefore.join('; ')} · после: ${Array.from(pa.modules.values()).join('; ')} · ряды ${after.segments.map((run) => `${run.wallId} ${run.lengthMm}/${run.modules.length}`).join(', ')} · план ${sa.plan} 3D ${sa.world} · итог ${before.total} → ${after.total}`,
    );
  }

  /* M2.21 правленая П: оба угла, длины рядов стен те же */
  {
    const survey = surveyOf([{ length: 3000, run: true }, { length: 3200 }, { length: 2600 }]);
    const corners: SavedCornerChoice[] = [
      { walls: ['w1', 'w2'], lower: 'blind', upper: 'blind' },
      { walls: ['w2', 'w3'], lower: 'blind', upper: 'blind' },
    ];
    const template = buildFromSurvey({ title: 'П 3000 + 3200 + 2600', survey, shape: 'u_shape', corners });
    if (template.refusal) throw new Error(`M2.21: ${template.refusal}`);
    const state = stateOf(survey, template, 'u_shape', corners);
    const before = buildState('П правленая', state, 'u_shape');
    const flipped = mirroredSurvey(survey, before.chain);
    if ('refusal' in flipped) throw new Error(`M2.21: ${flipped.refusal}`);
    const mirrored = mirroredState({ ...state, survey: flipped.survey }, contextOf(before, survey));
    const after = buildState('П правленая в зеркале', mirrored.state, 'u_shape');
    const lengths = (built: Built) =>
      built.segments
        .map((run) => `${run.wallId} ${run.lengthMm}`)
        .sort()
        .join(', ');
    const pairs: [[string, string], [string, string]][] = [
      [['w1', 'w2'], ['w2', 'w1']],
      [['w2', 'w3'], ['w3', 'w2']],
    ];
    const moved = pairs.flatMap(([was, now]) => {
      const pb = physicalOf(before, was);
      const pa = physicalOf(after, now);
      return Array.from(pb.modules).filter(([id, text]) => pa.modules.get(id) !== text).map(([id, text]) => `${id} ${text} → ${pa.modules.get(id)}`);
    });
    check(
      'M2.21 правленая П 3000 + 3200 + 2600 и «Отразить»: цепочка 3 → 2 → 1, ряд каждой стены той же длины (углы ведут те же стены), модули у обоих углов на своих местах, итог тот же',
      before.refusal === null && after.refusal === null && after.chain.join(',') === 'w3,w2,w1' && lengths(after) === lengths(before) && moved.length === 0 && after.total === before.total,
      `ряды ${lengths(before)} → ${lengths(after)} · не на месте ${moved.length}${moved.length ? `: ${moved.slice(0, 2).join('; ')}` : ''} · итог ${before.total} → ${after.total}`,
    );
  }
}

/* ─────────────────────────  Антресоли и углы  ───────────────────────── */

function mezzanineChecks(check: Check): void {
  const toCeiling = { ...DEMO_REQUIREMENTS, options: { ...DEMO_REQUIREMENTS.options, upperToCeiling: true }, lockedOptions: ['upperToCeiling' as const] };
  const straight = surveyOf([{ length: 3800, run: true }], { ceiling: 2700 });

  /* M2.24 до потолка с монтажным зазором цеха */
  {
    const gapped: ProductionSettings = { ...DEFAULT_PRODUCTION, ceilingGap: { gapMm: 30, confirmed: false } };
    const flat = buildFromSurvey({ title: 'прямая до потолка, зазор 0', survey: straight, shape: 'linear', requirements: toCeiling });
    const gap = buildFromSurvey({ title: 'прямая до потолка, зазор 30', survey: straight, shape: 'linear', requirements: toCeiling, production: gapped });
    const top = (built: Built) => Math.max(...built.segments.flatMap((run) => runPlaces(run).map((item) => Math.round((item.y + item.heightM) * 1000))));
    const storage = (built: Built) => {
      const run = built.segments[0];
      const unit = run.upperSegments.flatMap((s) => s.modules).find((m) => m.section === 'mezzanine');
      return unit ? levelOf(run, unit.id) : null;
    };
    const hits = hitsOf(gap, gapped);
    check(
      'M2.24 «до потолка» с монтажным зазором цеха 30 мм: верх всей мебели — 2670 при потолке 2700 (без зазора — 2700), кладовка над холодильником кончается там же, детали не входят друг в друга; без настройки — ноль, как было',
      flat.refusal === null && gap.refusal === null && top(flat) === 2700 && top(gap) === 2670 && storage(gap)?.top === 2670 && hits.hits.length === 0 && hits.pairs > 0,
      `верх ${top(flat)} → ${top(gap)} · кладовка ${JSON.stringify(storage(flat))} → ${JSON.stringify(storage(gap))} · итог ${flat.total} → ${gap.total} · входов ${hits.hits.length} из ${hits.pairs} пар${hits.hits.length ? `: ${hits.hits.slice(0, 2).join('; ')}` : ''}`,
    );
  }

  /* M2.25 антресоль в линию с высоким блоком */
  {
    const base = buildFromSurvey({ title: 'прямая с холодильником', survey: straight, shape: 'linear' });
    const withMezz = applyOps({ run: base.segments[0], requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_mezzanine', heightMm: 500 }] });
    const aligned = applyOps({ run: withMezz, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_mezzanine', heightMm: 500, alignTall: true }] });
    const built = buildFromSurvey({ title: 'антресоль в линию', survey: straight, shape: 'linear', working: aligned });
    const run = built.segments[0];
    const storage = tallStorageOf(run);
    const hanging = run.upperSegments.flatMap((s) => s.modules);
    const mezz = hanging.filter((m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run) === null).map((m) => levelOf(run, m.id)!);
    const stores = hanging.filter((m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run) !== null).map((m) => levelOf(run, m.id)!);
    const uppers = hanging.filter((m) => m.section !== 'mezzanine').map((m) => levelOf(run, m.id)!);
    const lines = (list: { bottom: number; top: number }[]) => Array.from(new Set(list.map((l) => `${l.bottom}…${l.top}`))).join(', ');
    const panels = buildPanels({ run, production: DEFAULT_PRODUCTION });
    const sideOf = (id: string | undefined) => panels.find((p) => p.moduleId === id && /Боковина/i.test(p.name))?.lengthMm;
    const mezzId = hanging.find((m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run) === null)?.id;
    const storeId = hanging.find((m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run) !== null)?.id;
    const hits = hitsOf(built, DEFAULT_PRODUCTION);
    const noFridge = buildFromSurvey({
      title: 'прямая без холодильника',
      survey: straight,
      shape: 'linear',
      requirements: { ...DEMO_REQUIREMENTS, appliances: DEMO_REQUIREMENTS.appliances.filter((a) => a !== 'fridge') },
    });
    const refused = applyOps({
      run: applyOps({ run: noFridge.segments[0], requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_mezzanine', heightMm: 500 }] }),
      requirements: DEMO_REQUIREMENTS,
      ops: [{ op: 'set_mezzanine', heightMm: 500, alignTall: true }],
    });
    check(
      'M2.25 антресоль «в линию с высоким блоком»: низ и верх антресоли над верхним рядом — те же, что у кладовки над колонной холодильника; верхний ряд дорастает до её низа; боковины антресоли и кладовки в раскрое одной длины; входов нет; без холодильника — отказ словами',
      Boolean(storage) &&
        mezz.length > 0 &&
        mezz.every((l) => l.bottom === storage!.bottomMm && l.top === storage!.bottomMm + storage!.heightMm) &&
        stores.every((l) => l.bottom === storage!.bottomMm) &&
        uppers.every((l) => l.top === storage!.bottomMm) &&
        sideOf(mezzId) !== undefined &&
        sideOf(mezzId) === sideOf(storeId) &&
        hits.hits.length === 0 &&
        /нет колонны холодильника/.test(refused.warnings.join(' ')) &&
        !refused.mezzanine?.alignTall,
      `кладовка ${storage ? `${storage.bottomMm}…${storage.bottomMm + storage.heightMm}` : 'нет'} · антресоль ${lines(mezz)} · кладовки ${lines(stores)} · верхний ряд ${lines(uppers)} · боковины ${sideOf(mezzId)} / ${sideOf(storeId)} мм · входов ${hits.hits.length} · без холодильника: «${refused.warnings[0] ?? ''}»`,
    );
  }

  /* M2.26 антресоль в углу: ведёт стена А и ведёт стена Б */
  const lSurvey = surveyOf([{ length: 3600, run: true }, { length: 2800 }]);
  const mezzOn = (built: Built): { working: Run; walls: Record<string, Run> } => {
    const rows = built.segments.map((run) => applyOps({ run, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_mezzanine', heightMm: 400 }] }));
    return { working: rows[0], walls: Object.fromEntries(rows.slice(1).map((run) => [run.wallId as string, run])) };
  };
  const mezzBounds = (built: Built) => built.segments.map((run) => {
    const bounds = levelBoundsOf(run, 'mezzanine');
    return { wall: run.wallId, from: bounds.fromMm, to: bounds.toMm, length: run.lengthMm, modules: run.upperSegments.flatMap((s) => s.modules).filter((m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run) === null).length };
  });
  {
    const results = (['prev', 'next'] as const).map((owner) => {
      const corners: SavedCornerChoice[] = [{ walls: ['w1', 'w2'], lower: 'blind', upper: 'blind', mezzanine: 'blind', owners: { mezzanine: owner } }];
      const template = buildFromSurvey({ title: `Г, антресоль ведёт ${owner}`, survey: lSurvey, shape: 'corner_l', corners });
      const edits = mezzOn(template);
      const built = buildFromSurvey({ title: `Г, антресоль ведёт ${owner}`, survey: lSurvey, shape: 'corner_l', corners, working: edits.working, editedWalls: edits.walls });
      return { owner, built, bounds: mezzBounds(built), hits: hitsOf(built, DEFAULT_PRODUCTION) };
    });
    const [a, b] = results;
    /* Отметки антресоли стены Б — от начала её нижнего ряда; от стены А — плюс то, что низ отдал углу. */
    const g = cornerGeometry({ lower: 'blind', upper: 'blind', mezzanine: 'blind' }, 'kitchen', DEFAULT_PRODUCTION);
    const fromWallA = (r: (typeof results)[number]) => r.bounds[1].from + lowerGapMm(r.built.segments[1], 'start');
    const aOk =
      a.built.refusal === null && a.bounds[0].to === a.bounds[0].length && fromWallA(a) === g.mezzStartMm && a.hits.hits.length === 0 && a.bounds.every((x) => x.modules > 0);
    const bOk =
      b.built.refusal === null && b.bounds[0].to === b.bounds[0].length - g.mezzStartMm && fromWallA(b) === 0 && b.hits.hits.length === 0 && b.bounds.every((x) => x.modules > 0);
    check(
      'M2.26 антресоль в углу Г 3600 + 2800 на обеих стенах: ведёт стена А — её антресоль до стены Б, антресоль Б за фальш-панелью; ведёт стена Б — наоборот; в обоих ни одна деталь не входит в другую',
      aOk && bOk,
      results
        .map((r) => `${r.owner === 'prev' ? 'ведёт А' : 'ведёт Б'}: ${r.bounds.map((x) => `${x.wall} ${x.from}…${x.to} из ${x.length} (${x.modules} мод.)`).join(', ')}, антресоль Б с ${fromWallA(r)} мм от стены А · входов ${r.hits.hits.length} из ${r.hits.pairs}${r.hits.hits.length ? `: ${r.hits.hits.slice(0, 2).join('; ')}` : ''}`)
        .join(' | ') + ` · угол: антресоль соседа с ${g.mezzStartMm} мм`,
    );
  }

  /* M2.27 разные глубины верхнего ряда и антресоли */
  {
    const deep: ProductionSettings = { ...DEFAULT_PRODUCTION, depths: { ...DEFAULT_PRODUCTION.depths, upperMm: 300, mezzanineMm: 400 } };
    const corners: SavedCornerChoice[] = [{ walls: ['w1', 'w2'], lower: 'blind', upper: 'blind', mezzanine: 'blind', owners: { mezzanine: 'prev' } }];
    const template = buildFromSurvey({ title: 'Г, верх 300 и антресоль 400', survey: lSurvey, shape: 'corner_l', corners, production: deep });
    const rows = template.segments.map((run) => applyOps({ run, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_mezzanine', heightMm: 400 }] }));
    const built = buildFromSurvey({ title: 'Г, верх 300 и антресоль 400', survey: lSurvey, shape: 'corner_l', corners, production: deep, working: rows[0], editedWalls: { w2: rows[1] } });
    const g = cornerGeometry(corners[0], 'kitchen', deep);
    const b = built.segments[1];
    const upperFrom = levelBoundsOf(b, 'upper').fromMm;
    const mezzFrom = levelBoundsOf(b, 'mezzanine').fromMm;
    const lower = lowerGapMm(b, 'start');
    const hits = hitsOf(built, deep);
    check(
      'M2.27 глубина верхнего ряда 300, антресоли 400 (цех): у стены Б верх начинается за 300 + фальш-панель, антресоль — за 400 + фальш-панель, своей глубиной, а не глубиной верха; входов нет',
      built.refusal === null && upperFrom + lower === g.upperStartMm && mezzFrom + lower === g.mezzStartMm && g.mezzStartMm - g.upperStartMm === 100 && hits.hits.length === 0,
      `угол: верх с ${g.upperStartMm}, антресоль с ${g.mezzStartMm} от стены А · ряд Б: верх от ${upperFrom}, антресоль от ${mezzFrom} (низ с ${lower}) · входов ${hits.hits.length} из ${hits.pairs}`,
    );
  }

  /* M2.28 П: два угла — свои владельцы антресоли, независимо */
  {
    const uSurvey = surveyOf([{ length: 3000, run: true }, { length: 3200 }, { length: 2800 }]);
    const choice = (owner: 'prev' | 'next', walls: [string, string]): SavedCornerChoice => ({ walls, lower: 'blind', upper: 'blind', mezzanine: 'blind', owners: { mezzanine: owner } });
    const build = (second: 'prev' | 'next') => {
      const corners = [choice('prev', ['w1', 'w2']), choice(second, ['w2', 'w3'])];
      const template = buildFromSurvey({ title: `П, второй угол ${second}`, survey: uSurvey, shape: 'u_shape', corners });
      const edits = mezzOn(template);
      return buildFromSurvey({ title: `П, второй угол ${second}`, survey: uSurvey, shape: 'u_shape', corners, working: edits.working, editedWalls: edits.walls });
    };
    const x = build('prev');
    const y = build('next');
    const bx = mezzBounds(x);
    const by = mezzBounds(y);
    const hx = hitsOf(x, DEFAULT_PRODUCTION);
    const hy = hitsOf(y, DEFAULT_PRODUCTION);
    check(
      'M2.28 П 3000 + 3200 + 2800: второй угол отдаёт антресоль стене В — у стены Б меняется только конец антресоли, начало (первый угол) то же; у стены А всё то же; входов нет в обоих',
      x.refusal === null && y.refusal === null && bx[0].to === by[0].to && bx[1].from === by[1].from && bx[1].to !== by[1].to && hx.hits.length === 0 && hy.hits.length === 0,
      `второй угол ведёт Б: ${bx.map((b) => `${b.wall} ${b.from}…${b.to}`).join(', ')} · ведёт В: ${by.map((b) => `${b.wall} ${b.from}…${b.to}`).join(', ')} · входов ${hx.hits.length}/${hy.hits.length}`,
    );
  }
}

/* ─────────────────────────  Три эталонные кухни  ───────────────────────── */

/**
 * КУХНИ С ФОТОГРАФИЙ ВЛАДЕЛЬЦА (часть 3.3): то, что они обещают, — числами.
 * Собраны путём экрана (`measurement-v2-kitchens.ts`): готовое решение,
 * правки операциями, материалы — `materialOps` панели «Материалы».
 */
function kitchenChecks(check: Check): void {
  const kitchens = referenceKitchens();
  const byKey = Object.fromEntries(kitchens.map((k) => [k.key, k])) as Record<ReferenceKitchen['key'], ReferenceKitchen>;
  const M = KITCHEN_MATERIALS;
  const itemOf = (m: Module) => m.front?.itemId ?? null;
  const levelsOf = (run: Run, list: Module[]) => list.map((m) => levelOf(run, m.id)!);
  const lines = (list: { bottom: number; top: number }[]) => Array.from(new Set(list.map((l) => `${l.bottom}…${l.top}`))).join(', ') || 'нет';
  const depthsOf = (run: Run, list: Module[]) =>
    Array.from(new Set(runPlaces(run).filter((p) => list.some((m) => m.id === p.unit.id)).map((p) => Math.round(p.depthM * 1000))));
  const lowersOf = (run: Run) => run.modules.filter((m) => hasFacade(m) && m.kind !== 'tall');
  /* Ход у угла — тот же, по которому экран запирает цену у правленых рядов (`cornerClashMismatches`). */
  const swingOf = (k: ReferenceKitchen) => {
    const kin = cornerKinematics({ runs: k.built.segments, places: k.built.places, production: k.production });
    return { clashes: kin.clashes, words: kin.clashes.slice(0, 2).map((c) => `${clashWords(c, (w) => `стены ${w + 1}`)} (${formatMm(c.depthMm)} мм)`).join('; ') };
  };

  /* M2.29 кухня 1 */
  {
    const k = byKey.k1;
    const [a, b] = k.built.segments;
    const hits = hitsOf(k.built, k.production);
    const swing = swingOf(k);
    const storage = tallStorageOf(b);
    const line = storage?.bottomMm ?? -1;
    const mezz = [...levelsOf(a, mezzOf(a)), ...levelsOf(b, mezzOf(b))];
    const uppers = [...levelsOf(a, uppersOf(a)), ...levelsOf(b, uppersOf(b))];
    const column = b.modules.find((m) => m.column && [m.column.top, m.column.bottom].sort().join() === 'microwave,oven');
    const columnTop = column ? levelOf(b, column.id)!.top : null;
    const colorsOk =
      [...lowersOf(a), ...lowersOf(b)].every((m) => itemOf(m) === M.grey.item.id) &&
      [...uppersOf(a), ...uppersOf(b)].every((m) => itemOf(m) === M.white.item.id) &&
      [...mezzOf(a), ...mezzOf(b)].every((m) => itemOf(m) === M.grey.item.id);
    check(
      'M2.29 кухня 1 (Г 3600 + 2800, путь экрана): серые нижние, белые верхние фасады, серая антресоль на обеих стенах, пенал «духовка + СВЧ» и холодильник; верх рядов, антресоль и кладовка над холодильником — на одной отметке, верх антресоли — верх пенала; ни одна деталь не входит в другую ни стоя, ни на ходу створок у угла',
      k.built.refusal === null &&
        mezzOf(a).length > 0 &&
        mezzOf(b).length > 0 &&
        Boolean(storage) &&
        mezz.every((l) => l.bottom === line) &&
        uppers.every((l) => l.top === line) &&
        storesOf(b).every((m) => levelOf(b, m.id)!.bottom === line) &&
        columnTop !== null &&
        mezz.every((l) => l.top === columnTop) &&
        b.modules.some((m) => m.appliance === 'fridge') &&
        colorsOk &&
        hits.hits.length === 0 &&
        hits.pairs > 0 &&
        swing.clashes.length === 0,
      `антресоль ${lines(mezz)} · верхний ряд ${lines(uppers)} · кладовка ${storage ? `${storage.bottomMm}…${storage.bottomMm + storage.heightMm}` : 'нет'} · пенал ${column?.id ?? 'нет'} до ${columnTop} · цвета ${colorsOk ? 'как на фото' : 'НЕ ТАК'} · входов ${hits.hits.length} из ${hits.pairs}${hits.hits.length ? `: ${hits.hits.slice(0, 2).join('; ')}` : ''} · заходов на ходу у угла ${swing.clashes.length}${swing.words ? `: ${swing.words}` : ''}`,
    );
  }

  /* M2.29 кухня 2 */
  {
    const k = byKey.k2;
    const [a, b] = k.built.segments;
    const hits = hitsOf(k.built, k.production);
    const swing = swingOf(k);
    const g = cornerGeometry(k.corners![0], 'kitchen', k.production);
    const ma = levelBoundsOf(a, 'mezzanine');
    const mb = levelBoundsOf(b, 'mezzanine');
    const ub = levelBoundsOf(b, 'upper');
    const upperDepths = [...depthsOf(a, uppersOf(a)), ...depthsOf(b, uppersOf(b))];
    const mezzDepths = [...depthsOf(a, mezzOf(a)), ...depthsOf(b, mezzOf(b))];
    /* Низ ведёт А (ряд Б начинается за занятым углом), антресоль ведёт Б: её антресоль от стены А, у А — короче на глубину антресоли и панель. */
    const ownersOk =
      lowerGapMm(a, 'end') === 0 &&
      lowerGapMm(b, 'start') === g.lostMm &&
      mb.fromMm + lowerGapMm(b, 'start') === 0 &&
      ma.toMm === a.lengthMm - g.mezzStartMm &&
      ub.fromMm > mb.fromMm;
    const colorsOk =
      [...lowersOf(a), ...lowersOf(b)].every((m) => itemOf(m) === M.grey.item.id) &&
      [...uppersOf(a), ...uppersOf(b), ...mezzOf(a), ...mezzOf(b)].every((m) => itemOf(m) === M.white.item.id);
    check(
      'M2.29 кухня 2 (Г 3400 + 2600): серые нижние, белые верхние и антресоль на обеих стенах; глубина верха 300, антресоли 400 (отметки объекта); угол низа ведёт стена А, угол антресоли — стена Б; ни одна деталь не входит в другую ни стоя, ни на ходу створок у угла',
      k.built.refusal === null &&
        mezzOf(a).length > 0 &&
        mezzOf(b).length > 0 &&
        Array.from(new Set(upperDepths)).join() === '300' &&
        Array.from(new Set(mezzDepths)).join() === '400' &&
        ownersOk &&
        colorsOk &&
        hits.hits.length === 0 &&
        hits.pairs > 0 &&
        swing.clashes.length === 0,
      `глубины: верх ${Array.from(new Set(upperDepths)).join('/')}, антресоль ${Array.from(new Set(mezzDepths)).join('/')} · антресоль А ${ma.fromMm}…${ma.toMm} из ${a.lengthMm}, Б ${mb.fromMm}…${mb.toMm} (низ Б с ${lowerGapMm(b, 'start')}, верх Б с ${ub.fromMm}) · угол: низ занял ${g.lostMm}, антресоль соседа с ${g.mezzStartMm} · цвета ${colorsOk ? 'как на фото' : 'НЕ ТАК'} · входов ${hits.hits.length} из ${hits.pairs} · заходов на ходу у угла ${swing.clashes.length}${swing.words ? `: ${swing.words}` : ''}`,
    );
  }

  /* M2.29 кухня 3 */
  {
    const k = byKey.k3;
    const run = k.built.segments[0];
    const before = k.alignWall!.before;
    const hits = hitsOf(k.built, k.production);
    const storage = tallStorageOf(run);
    const line = storage?.bottomMm ?? -1;
    const mezz = levelsOf(run, mezzOf(run));
    const mezzBefore = levelsOf(before, mezzOf(before));
    const uppers = levelsOf(run, uppersOf(run));
    const column = run.modules.find((m) => m.column);
    const columnTop = column ? levelOf(run, column.id)!.top : null;
    const block = tallBlockOf(run);
    const colorsOk =
      block.length >= 3 &&
      block.every((m) => itemOf(m) === M.wood.item.id) &&
      [...lowersOf(run), ...uppersOf(run), ...mezzOf(run)].every((m) => itemOf(m) === M.teal.item.id);
    check(
      'M2.29 кухня 3 (прямая 4200): зелёно-синие фасады RAL 190 40 15, высокие секции — древесный декор EGGER H1145; антресоль над рабочей зоной «в линию с высоким блоком»: её низ — низ кладовки над холодильником, верх — верх пенала; без режима низ был другим; входов нет',
      k.built.refusal === null &&
        mezz.length > 0 &&
        Boolean(storage) &&
        Boolean(run.mezzanine?.alignTall) &&
        mezz.every((l) => l.bottom === line) &&
        uppers.every((l) => l.top === line) &&
        columnTop !== null &&
        mezz.every((l) => l.top === columnTop) &&
        mezzBefore.some((l) => l.bottom !== line) &&
        colorsOk &&
        hits.hits.length === 0 &&
        hits.pairs > 0,
      `антресоль ${lines(mezz)} (без режима ${lines(mezzBefore)}) · верхний ряд ${lines(uppers)} · кладовка ${storage ? `${storage.bottomMm}…${storage.bottomMm + storage.heightMm}` : 'нет'} · пенал до ${columnTop} · высокий блок ${block.length} модулей · цвета ${colorsOk ? 'как на фото' : 'НЕ ТАК'} · входов ${hits.hits.length} из ${hits.pairs}`,
    );
  }

  /* M2.29 смета кухонь — путём экрана, с каталогом материалов организации */
  {
    const keyOf = (choice: (typeof M)[keyof typeof M]) => `front_item_${choice.item.id}_${choice.surface}`;
    const want: Record<ReferenceKitchen['key'], string[]> = {
      k1: [keyOf(M.grey), keyOf(M.white)],
      k2: [keyOf(M.grey), keyOf(M.white)],
      k3: [keyOf(M.wood), keyOf(M.teal)],
    };
    const rows = kitchens.map((k) => {
      const got = [...k.built.unpriced].sort();
      const need = [...want[k.key]].sort();
      return { ok: got.join('|') === need.join('|'), words: `${k.key}: итог ${k.built.total} ₸, без цены — ${got.join(', ') || 'НИЧЕГО'}${got.join('|') === need.join('|') ? '' : ` (нужно ${need.join(', ')})`}` };
    });
    check(
      'M2.29 смета трёх кухонь путём экрана (каталог материалов организации в `objectInput`): фасады позиций RAL и EGGER — своими строками «цена не задана» (цены в файле каталога нет), других строк без цены нет; итог неполный — ставкой цеха их не подменили',
      rows.every((row) => row.ok),
      rows.map((row) => `${row.ok ? '' : 'НЕ ТАК '}${row.words}`).join(' | '),
    );
  }

  /* M2.32 «Соединить в углу»: антресоль переходит к стене Б карточкой угла */
  {
    const k = byKey.k2;
    const change = k.ownerChange!;
    const card = change.card;
    const [a0, b0] = change.built.segments;
    const [a1, b1] = k.built.segments;
    const shape = (list: Module[]) => list.map((m) => `${m.id}:${m.offsetMm}+${m.widthMm}:${m.front?.itemId ?? ''}`).join(',');
    const lowerSame = shape(a0.modules) === shape(a1.modules) && shape(b0.modules) === shape(b1.modules);
    const upperSame = shape(uppersOf(a0)) === shape(uppersOf(a1)) && shape(uppersOf(b0)) === shape(uppersOf(b1));
    const prints = (runs: Run[]) => runs.map((run) => run.fingerprint).join(',');
    const swing = swingOf(k);
    const hits = hitsOf(k.built, k.production);
    const mezzWhite = [...mezzOf(a1), ...mezzOf(b1)].every((m) => itemOf(m) === M.white.item.id);
    check(
      'M2.32 «Соединить в углу», антресоль: поставлена при «ведёт стена А», карточка «Антресоль: Стена Б идёт в угол» — без пересборки стен (низ и верх обеих стен те же до модуля и фасада), антресоль на обеих стенах в новых границах, фасады прежние; что изменится и открывание — словами до нажатия; итог = антресоль, собранная сразу при «ведёт стена Б» (отпечатки те же)',
      !card.refusal &&
        !card.rebuild &&
        (card.changes ?? []).length >= 2 &&
        card.opening?.ok === true &&
        lowerSame &&
        upperSame &&
        mezzOf(a1).length > 0 &&
        mezzOf(b1).length > 0 &&
        mezzWhite &&
        prints(k.built.segments) === prints(change.fresh.segments) &&
        hits.hits.length === 0 &&
        swing.clashes.length === 0,
      `карточка: ${card.refusal ?? (card.changes ?? []).join(' | ')} · открывание: ${card.opening?.words ?? 'не мерено'} · ` +
        `низ ${lowerSame ? 'тот же' : 'ДРУГОЙ'}, верх ${upperSame ? 'тот же' : 'ДРУГОЙ'} · антресоль А ${mezzOf(a1).length}, Б ${mezzOf(b1).length} мод., фасады ${mezzWhite ? 'прежние' : 'НЕ ТЕ'} · ` +
        `отпечатки ${prints(k.built.segments)} при сразу собранной ${prints(change.fresh.segments)} · входов ${hits.hits.length}, заходов ${swing.clashes.length}`,
    );
  }

  /* M2.30 деталировка антресолей = нарисованное */
  {
    const bad: string[] = [];
    let sides = 0;
    let fillers = 0;
    for (const k of kitchens) {
      k.built.segments.forEach((run) => {
        const panels = buildPanels({ run, production: k.production });
        const places = runPlaces(run);
        for (const m of [...mezzOf(run), ...storesOf(run)]) {
          const place = places.find((p) => p.unit.id === m.id);
          const own = panels.filter((p) => p.moduleId === m.id && p.name === 'Боковина');
          const h = place ? Math.round(place.heightM * 1000) : -1;
          const d = place ? Math.round(place.depthM * 1000) : -1;
          sides += own.reduce((sum, p) => sum + p.qty, 0);
          if (own.length === 0 || own.some((p) => p.lengthMm !== h || p.widthMm !== d)) {
            bad.push(`${k.key} ${m.id}: боковины ${own.map((p) => `${p.lengthMm}×${p.widthMm}`).join(',') || 'нет'} при корпусе ${h}×${d} в сцене`);
          }
        }
        const shop = { thicknessMm: k.production.carcassMm, frontThicknessMm: k.production.frontMm, gapMm: k.production.frontGapMm, production: k.production };
        for (const box of runBoxesByModule(run, shop).fillers.filter((item) => /антресоли/.test(item.panel ?? ''))) {
          fillers += 1;
          const len = Math.round(box.scale[1] * 1000);
          const wid = Math.round(box.scale[0] * 1000);
          const found = panels.some((p) => p.name === box.panel && Math.abs(p.lengthMm - len) <= 1 && Math.abs(p.widthMm - wid) <= 1);
          if (!found) {
            bad.push(`${k.key} ${run.wallId}: «${box.panel}» в сцене ${len}×${wid}, в деталировке ${panels.filter((p) => p.name === box.panel).map((p) => `${p.lengthMm}×${p.widthMm}`).join(',') || 'нет'}`);
          }
        }
      });
    }
    check(
      'M2.30 деталировка антресолей трёх кухонь = нарисованное: боковина каждой антресоли и кладовки — высотой и глубиной её корпуса в сцене (у кухни 2 — 400, а не 300 верха); фальш-панель угла антресоли — деталью того же размера, что в сцене',
      bad.length === 0 && sides > 0 && fillers >= 2,
      `боковин ${sides}, фальш-панелей угла антресоли ${fillers}${bad.length ? ` · НЕ ТАК ${bad.length}: ${bad.slice(0, 3).join('; ')}` : ''}`,
    );
  }

  /* M2.31 запись и открытие без изменения геометрии */
  {
    const rows = kitchens.map((k) => {
      const saved = JSON.parse(JSON.stringify(kitchenState(k)));
      const reopened = buildFromSurvey({
        title: `${k.title} после открытия`,
        survey: saved.survey,
        shape: saved.shape,
        requirements: saved.requirements,
        corners: saved.corners,
        production: productionFor(DEFAULT_PRODUCTION, saved.production),
        working: saved.runs.optimal,
        editedWalls: saved.wallRuns ?? {},
        materials: KITCHEN_MATERIAL_ITEMS,
      });
      const prints = (runs: Run[]) => runs.map((run) => run.fingerprint).join(',');
      /* Второй читатель сохранённого объекта — кабинет клиента (`projectOffer`): отметки объекта и ряды из записи. */
      const offer = projectOffer({
        title: k.title,
        zone: 'Кухня',
        measurement: resolveSurvey(saved.survey).measurement,
        state: saved,
        production: DEFAULT_PRODUCTION,
        catalog: KITCHEN_CATALOG,
        rates: DEMO_RATES,
      });
      const cabinet =
        offer.state === 'built'
          ? { total: Math.round(offer.estimate.total), prints: prints(offer.segments), unpriced: unpricedLines(offer.estimate).map((line) => line.key).join(',') }
          : null;
      return {
        ok:
          reopened.refusal === null &&
          furniture(reopened) === furniture(k.built) &&
          reopened.total === k.built.total &&
          reopened.unpriced.join(',') === k.built.unpriced.join(',') &&
          prints(reopened.segments) === prints(k.built.segments) &&
          cabinet !== null &&
          cabinet.total === k.built.total &&
          cabinet.unpriced === k.built.unpriced.join(',') &&
          cabinet.prints === prints(k.built.segments),
        words:
          `${k.key}: ${reopened.refusal ?? `итог ${k.built.total} → ${reopened.total}, отпечатки ${prints(k.built.segments)} → ${prints(reopened.segments)}`}` +
          ` · кабинет ${cabinet ? `${cabinet.total}, ${cabinet.prints}` : offer.state === 'refused' ? `отказ: ${offer.refusal}` : 'нет'}`,
      };
    });
    check(
      'M2.31 три кухни: «записал — открыл» (JSON) — та же мебель в мире до миллиметра, тот же итог, те же строки без цены и те же отпечатки; кабинет клиента по записи (`projectOffer`, каталог организации) — тот же итог, строки без цены и отпечатки',
      rows.every((row) => row.ok),
      rows.map((row) => `${row.ok ? '' : 'НЕ ТАК '}${row.words}`).join(' | '),
    );
  }
}

/* ─────────────────────────  Место модуля  ───────────────────────── */

function placementChecks(check: Check): void {
  const survey = surveyOf([{ length: 2360, run: true }, { length: 2540 }]);
  const corners: SavedCornerChoice[] = [{ walls: ['w1', 'w2'], lower: 'blind', upper: 'blind' }];
  const requirements = { ...DEMO_REQUIREMENTS, mode: 'free' as const };
  const empty = buildFromSurvey({ title: 'Г свободная', survey, shape: 'corner_l', corners, requirements });
  if (empty.refusal) throw new Error(`M2.22: ${empty.refusal}`);
  const [a, b] = empty.segments;
  const withOne = applyOps({ run: a, requirements, ops: [{ op: 'add_module', kind: 'base', widthMm: 600, atMm: 200 }] });
  const unit = withOne.modules[0];
  const exact = applyOps({ run: withOne, requirements, ops: [{ op: 'move_module', moduleId: unit.id, offsetMm: 357, exact: true }] });
  const handed = applyOps({ run: withOne, requirements, ops: [{ op: 'move_module', moduleId: unit.id, offsetMm: 357 }] });
  const beyond = applyOps({ run: withOne, requirements, ops: [{ op: 'move_module', moduleId: unit.id, offsetMm: a.lengthMm - 300, exact: true }] });
  check(
    'M2.22 точная отметка: «от левого угла» 357 мм — модуль на 357 (рука — шагом 50: 350); с отметки, где он вышел бы за ряд, — отказ с мм, модуль на месте',
    exact.modules[0]?.offsetMm === 357 && handed.modules[0]?.offsetMm === 350 && beyond.modules[0]?.offsetMm === 200 && /вышел бы за конец ряда/.test(beyond.warnings.join(' ')),
    `точно ${exact.modules[0]?.offsetMm}, рукой ${handed.modules[0]?.offsetMm}, за ряд: ${beyond.modules[0]?.offsetMm} · «${beyond.warnings[0] ?? ''}»`,
  );

  /* Модуль 580 мм с полками и петлями справа — на стену Б целиком. */
  const custom = applyOps({
    run: withOne,
    requirements,
    ops: [
      { op: 'set_width', moduleId: unit.id, widthMm: 580 },
    ],
  });
  const wide = custom.modules[0];
  const hinged = applyOps({ run: custom, requirements, ops: [{ op: 'set_opening', moduleId: wide.id, opening: 'right' }] });
  const moving = hinged.modules[0];
  const source = applyOps({ run: hinged, requirements, ops: [{ op: 'remove_module', moduleId: moving.id }] });
  const target = applyOps({ run: b, requirements, ops: [{ op: 'add_module', kind: moving.kind, module: moving, atMm: 100 }] });
  const landed = target.modules.find((m) => m.offsetMm === 100);
  const occupied = applyOps({ run: target, requirements, ops: [{ op: 'add_module', kind: moving.kind, module: moving, atMm: 300 }] });
  check(
    'M2.23 модуль на другую стену целиком: 580 мм (не стандарт 600), петли справа и полки — те же, ключ — от отметки и стены Б; на занятое место — отказ с мм, ряд прежний',
    source.modules.length === 0 &&
      wide.widthMm === 580 &&
      landed?.widthMm === 580 &&
      landed?.fill?.hinge === 'right' &&
      JSON.stringify(landed?.fill?.shelves) === JSON.stringify(moving.fill?.shelves) &&
      landed?.id === `base-100@${b.wallId}` &&
      occupied.modules.length === target.modules.length &&
      occupied.warnings.length > 0,
    `снят ${source.modules.length === 0 ? 'да' : 'нет'} · встал ${landed ? `${landed.id} ${landed.widthMm} мм, петли ${landed.fill?.hinge}` : 'НЕТ'} · на занятое: «${occupied.warnings[0] ?? ''}»`,
  );
}

/** Точки плана, повёрнутые как на экране (по часовой, ось Y вниз). */
function rotated(point: { x: number; y: number }, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: point.x * Math.cos(a) - point.y * Math.sin(a), y: point.x * Math.sin(a) + point.y * Math.cos(a) };
}

export function measurementV2Checks(check: Check): void {
  console.log('\nMeasurement 2.0: замер, обход, сторона кухни — путём экрана');

  /* ── M2.1 Г в четырёх положениях ── */
  {
    const arms: Record<string, (c: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => boolean> = {
      '└': (c, a, b) => a.x > c.x + 1 && Math.abs(a.y - c.y) < 1 && b.y < c.y - 1 && Math.abs(b.x - c.x) < 1,
      '┘': (c, a, b) => a.y < c.y - 1 && Math.abs(a.x - c.x) < 1 && b.x < c.x - 1 && Math.abs(b.y - c.y) < 1,
      '┌': (c, a, b) => a.y > c.y + 1 && Math.abs(a.x - c.x) < 1 && b.x > c.x + 1 && Math.abs(b.y - c.y) < 1,
      '┐': (c, a, b) => a.x < c.x - 1 && Math.abs(a.y - c.y) < 1 && b.y > c.y + 1 && Math.abs(b.x - c.x) < 1,
    };
    const rows = L_TILES.map((tile) => {
      const survey = tileSurvey(BASE, { kind: 'L', rotation: tile.rotation }, [2360, 2540]);
      const built = buildFromSurvey({ title: `Г ${tile.glyph}`, survey, shape: 'corner_l' });
      const s = sides(built, survey, 'w1', 'w2');
      const plan = planCorner(survey, 'w1', 'w2');
      const r = (p: { x: number; y: number }) => rotated(p, survey.planRotationDeg ?? 0);
      return { tile, survey, built, s, looks: arms[tile.glyph](r(plan.corner), r(plan.far), r(plan.farB)) };
    });
    const totals = new Set(rows.map((row) => row.built.total));
    const same = new Set(rows.map((row) => furniture(row.built)));
    check(
      'M2.1 Г в четырёх положениях (└ ┘ ┌ ┐), А 2360, Б 2540: каждая собрана на стенах А и Б, план повёрнут как плитка, сторона кухни на плане и в 3D одна; это одна кухня — мебель и итог те же',
      rows.every((row) => row.built.refusal === null && row.built.chain.join(',') === 'w1,w2' && row.s.plan === row.s.world && row.looks) &&
        totals.size === 1 &&
        same.size === 1,
      rows.map((row) => `${row.tile.glyph}: ${row.built.refusal ?? row.built.chain.join('→')} · поворот ${row.survey.planRotationDeg}° · план ${row.s.plan > 0 ? '+' : '−'} 3D ${row.s.world > 0 ? '+' : '−'} · вид ${row.looks ? 'как плитка' : 'НЕ как плитка'}`).join(' | ') +
        ` · итогов ${totals.size} (${Array.from(totals).join(', ')}), мебели ${same.size}`,
    );
  }

  /* ── M2.2 объект заказчика: Г обходом налево ── */
  const leftL = surveyOf([{ length: 2360, turn: 'left', run: true }, { length: 2540 }]);
  const rightL = surveyOf([{ length: 2360, turn: 'right', run: true }, { length: 2540 }]);
  const builtLeft = buildFromSurvey({ title: 'Г 2360 налево 2540', survey: leftL, shape: 'corner_l' });
  const builtRight = buildFromSurvey({ title: 'Г 2360 направо 2540', survey: rightL, shape: 'corner_l' });
  {
    const l = sides(builtLeft, leftL, 'w1', 'w2');
    const r = sides(builtRight, rightL, 'w1', 'w2');
    check(
      'M2.2 Г 2360 + 2540, обход налево (как у объекта заказчика): кухня в углу стен 1 и 2, стена А — стена 2 (левая, если стоять лицом к углу); сторона кухни на плане и в 3D одна — у обхода налево и направо, и эти кухни — зеркала друг друга',
      builtLeft.refusal === null && builtRight.refusal === null && builtLeft.chain.join(',') === 'w2,w1' && builtRight.chain.join(',') === 'w1,w2' &&
        l.plan === l.world && r.plan === r.world && l.plan !== r.plan,
      `налево: ${builtLeft.refusal ?? builtLeft.chain.join('→')}, план ${l.plan} 3D ${l.world} · направо: ${builtRight.refusal ?? builtRight.chain.join('→')}, план ${r.plan} 3D ${r.world}`,
    );
  }

  /* ── M2.3 прежний замер не меняется молча ── */
  {
    const legacy = surveyOf([{ length: 2360, turn: 'left', run: true }, { length: 2540 }], { version: false });
    const legacyRight = surveyOf([{ length: 2360, turn: 'right', run: true }, { length: 2540 }], { version: false });
    const a = buildFromSurvey({ title: 'прежний Г налево', survey: legacy, shape: 'corner_l' });
    const b = buildFromSurvey({ title: 'прежний Г направо', survey: legacyRight, shape: 'corner_l' });
    const s = sides(a, legacy, 'w1', 'w2');
    check(
      'M2.3 прежний замер (до 2.0) с поворотом налево: мебель стоит, как стояла (цепочка 1 → 2, та же мебель и итог, что у поворота направо), расхождение плана и 3D названо (`legacyMirrored`), а у замера 2.0 его нет',
      a.refusal === null && a.chain.join(',') === 'w1,w2' && furniture(a) === furniture(b) && a.total === b.total &&
        s.plan !== s.world && legacyMirrored(legacy) && !legacyMirrored(leftL) && !legacyMirrored(legacyRight),
      `цепочка ${a.chain.join('→')}, итог ${a.total} = ${b.total}, план ${s.plan} 3D ${s.world} · названо ${legacyMirrored(legacy)}`,
    );
  }

  /* ── M2.4 П в двух зеркальных положениях ── */
  {
    const u = surveyOf([{ length: 2800 }, { length: 3200 }, { length: 1800 }]);
    const mirror = mirroredSurvey(u, ['w1', 'w2', 'w3']);
    if ('refusal' in mirror) throw new Error(`M2.4: ${mirror.refusal}`);
    const a = buildFromSurvey({ title: 'П 2800 + 3200 + 1800', survey: u, shape: 'u_shape' });
    const b = buildFromSurvey({ title: 'П зеркальная', survey: mirror.survey, shape: 'u_shape' });
    const a12 = sides(a, u, 'w1', 'w2');
    const a23 = sides(a, u, 'w2', 'w3');
    const b12 = sides(b, mirror.survey, 'w1', 'w2');
    const b23 = sides(b, mirror.survey, 'w2', 'w3');
    const lengthA = (built: Built) => built.site.walls[0]?.lengthMm;
    check(
      'M2.4 П 2800 + 3200 + 1800 и её зеркало: обе собраны на тех же трёх стенах, у обоих углов сторона на плане и в 3D одна, стороны зеркальных — противоположные; у зеркальной стена А — короткая (1800)',
      a.refusal === null && b.refusal === null && a.chain.join(',') === 'w1,w2,w3' && b.chain.join(',') === 'w3,w2,w1' &&
        a12.plan === a12.world && a23.plan === a23.world && b12.plan === b12.world && b23.plan === b23.world &&
        a12.plan !== b12.plan && lengthA(a) === 2800 && lengthA(b) === 1800,
      `П: ${a.refusal ?? a.chain.join('→')} (${a12.plan}/${a12.world}, ${a23.plan}/${a23.world}) · зеркало: ${b.refusal ?? b.chain.join('→')} (${b12.plan}/${b12.world}, ${b23.plan}/${b23.world}) · А ${lengthA(a)} / ${lengthA(b)}`,
    );
  }

  /* ── M2.5 повороты вправо и влево ── */
  {
    const u = surveyOf([{ length: 2800 }, { length: 3200 }, { length: 1800 }]);
    const outer = withTurn(u, 'w2', 'left');
    const back = withTurn(outer, 'w2', 'right');
    const refused = buildFromSurvey({ title: 'П с выступом', survey: outer, shape: 'u_shape' });
    const restored = buildFromSurvey({ title: 'П обратно', survey: back, shape: 'u_shape' });
    const l = surveyOf([{ length: 2360 }, { length: 2540 }]);
    const flipped = buildFromSurvey({ title: 'Г повернули налево', survey: withTurn(l, 'w1', 'left'), shape: 'corner_l' });
    check(
      'M2.5 поворот второй стены П налево — наружный угол: отказ словами, а не кухня через выступ; обратно направо — та же П; у Г поворот налево переносит кухню в зеркальное положение (стена А — вторая)',
      refused.refusal !== null && /наружный/.test(refused.refusal) && restored.refusal === null && restored.chain.join(',') === 'w1,w2,w3' &&
        flipped.refusal === null && flipped.chain.join(',') === 'w2,w1',
      `выступ: «${refused.refusal}» · обратно: ${restored.chain.join('→')} · Г налево: ${flipped.chain.join('→')}`,
    );
  }

  /* ── M2.6 отражение ── */
  {
    const window = {
      id: 'win', kind: 'window' as const,
      fromCornerMm: { state: 'measured' as const, value: 600 }, widthMm: { state: 'measured' as const, value: 900 },
      heightMm: { state: 'measured' as const, value: 1400 }, sillMm: { state: 'measured' as const, value: 900 },
    };
    const l = surveyOf([{ length: 2360, openings: [window] }, { length: 2540 }]);
    const once = mirroredSurvey(l, ['w1', 'w2']);
    if ('refusal' in once) throw new Error(`M2.6: ${once.refusal}`);
    const twice = mirroredSurvey(once.survey, ['w2', 'w1']);
    if ('refusal' in twice) throw new Error(`M2.6: ${twice.refusal}`);
    const a = buildFromSurvey({ title: 'Г с окном', survey: l, shape: 'corner_l' });
    const b = buildFromSurvey({ title: 'Г с окном в зеркале', survey: once.survey, shape: 'corner_l' });
    /* Окно от угла стен 1–2: до отражения угол в конце стены 1 (А), после — в её начале (Б). */
    const fromCorner = (built: Built) => {
      const object = built.room?.objects.find((item) => item.id === 'win');
      const wall = built.room?.walls.find((item) => item.id === 'w1');
      if (!object || !wall) return null;
      const cornerAtEnd = built.chain[0] === 'w1';
      return cornerAtEnd ? wall.lengthMm - object.fromMm - object.widthMm : object.fromMm;
    };
    const mirroredFrom = valueOf(once.survey.walls[0].openings[0].fromCornerMm);
    const same = JSON.stringify(twice.survey.walls.map((w) => [w.id, w.turn, w.turnDeg, valueOf(w.lengthMm), w.openings.map((o) => valueOf(o.fromCornerMm))])) ===
      JSON.stringify(l.walls.map((w) => [w.id, w.turn, w.turnDeg, valueOf(w.lengthMm), w.openings.map((o) => valueOf(o.fromCornerMm))]));
    const s = sides(b, once.survey, 'w1', 'w2');
    check(
      'M2.6 отражение: поворот налево, окно 600 + 900 на стене 2360 — привязка от левого угла 860 (тот же угол), окно в мире на 860 от угла стен 1–2 до и после; ряд на тех же стенах, сторона на плане и в 3D одна; дважды — исходный замер',
      mirroredFrom === 860 && fromCorner(a) === 860 && fromCorner(b) === 860 && b.chain.join(',') === 'w2,w1' && s.plan === s.world && same,
      `привязка ${mirroredFrom} · от угла ${fromCorner(a)} → ${fromCorner(b)} · цепочка ${b.chain.join('→')} · план ${s.plan} 3D ${s.world} · дважды ${same ? 'тот же' : 'ДРУГОЙ'}`,
    );
  }

  /* ── M2.7 сторона комнаты ── */
  {
    const one = surveyOf([{ length: 3800 }]);
    const oneLeft = surveyOf([{ length: 3800 }], { interior: 'left' });
    const a = buildFromSurvey({ title: 'прямая, комната справа', survey: one, shape: 'linear' });
    const b = buildFromSurvey({ title: 'прямая, комната слева', survey: oneLeft, shape: 'linear' });
    const l = surveyOf([{ length: 2360 }, { length: 2540 }], { interior: 'left' });
    const outer = buildFromSurvey({ title: 'Г, комната снаружи угла', survey: l, shape: 'corner_l' });
    check(
      'M2.7 сторона комнаты: у прямой стены она выбирается и мебель та же (ряд всегда лицом в комнату), обход разворачивается (`reversed`); у Г комната снаружи угла — наружный угол, отказ словами',
      a.refusal === null && b.refusal === null && furniture(a) === furniture(b) && canonicalWalk(oneLeft).reversed && !canonicalWalk(one).reversed &&
        outer.refusal !== null && /наружный/.test(outer.refusal),
      `прямая: мебель ${furniture(a) === furniture(b) ? 'та же' : 'другая'} · Г снаружи: «${outer.refusal}»`,
    );
  }

  /* ── M2.8 размеры, разворот обхода, начало обхода ── */
  {
    const l = surveyOf([{ length: 2360 }, { length: 2540 }]);
    const longer = surveyOf([{ length: 2360 }, { length: 2840 }]);
    const a = buildFromSurvey({ title: 'Г', survey: l, shape: 'corner_l' });
    const b = buildFromSurvey({ title: 'Г длиннее', survey: longer, shape: 'corner_l' });
    const reversed = buildFromSurvey({ title: 'Г обход наоборот', survey: reversedWalk(l), shape: 'corner_l' });
    const room = surveyOf([{ length: 3600 }, { length: 2800 }, { length: 3600 }, { length: 2800 }]);
    const from3 = startedAt(room, 'w3');
    const r1 = buildFromSurvey({ title: 'комната от стены 1', survey: room, shape: 'corner_l' });
    const r3 = buildFromSurvey({ title: 'комната от стены 3', survey: { ...from3, walls: from3.walls.map((w) => ({ ...w, isRunWall: w.id === 'w1' })) }, shape: 'corner_l' });
    const lengthB = (built: Built) => built.rows[1]?.lengthMm ?? 0;
    check(
      'M2.8 размеры: стена Б 2540 → 2840 — ряд Б длиннее ровно на 300; тот же обход в обратную сторону и замкнутая комната, обойдённая с другой стены, — та же мебель и тот же итог',
      a.refusal === null && b.refusal === null && lengthB(b) - lengthB(a) === 300 &&
        reversed.refusal === null && furniture(reversed) === furniture(a) && reversed.total === a.total &&
        r1.refusal === null && r3.refusal === null && furniture(r1) === furniture(r3) && r1.total === r3.total,
      `ряд Б ${lengthB(a)} → ${lengthB(b)} · наоборот ${furniture(reversed) === furniture(a) ? 'та же' : 'другая'} · с другой стены ${furniture(r1) === furniture(r3) ? 'та же' : 'другая'}`,
    );
  }

  /* ── M2.9 сохранение и открытие ── */
  {
    const survey = tileSurvey(BASE, { kind: 'L', rotation: 90 }, [2360, 2540]);
    const saved = JSON.parse(JSON.stringify({ survey })).survey as Survey;
    const a = buildFromSurvey({ title: 'до записи', survey, shape: 'corner_l' });
    const b = buildFromSurvey({ title: 'после открытия', survey: saved, shape: 'corner_l' });
    check(
      'M2.9 замер 2.0 переживает запись и открытие (JSON): версия, поворот плана и обход те же — та же мебель, итог и цепочка',
      saved.version === 2 && saved.planRotationDeg === 90 && furniture(a) === furniture(b) && a.total === b.total && a.chain.join() === b.chain.join(),
      `версия ${saved.version}, поворот ${saved.planRotationDeg}° · итог ${a.total} = ${b.total}`,
    );
  }

  /* ── M2.10 стена без длины рвёт цепочку ── */
  {
    const gap = surveyOf([{ length: 3000 }, { length: null }, { length: 3000 }]);
    const legacyGap = surveyOf([{ length: 3000 }, { length: null }, { length: 3000 }], { version: false });
    const v2 = buildFromSurvey({ title: 'П со стеной без длины', survey: gap, shape: 'u_shape' });
    const old = buildFromSurvey({ title: 'прежний П со стеной без длины', survey: legacyGap, shape: 'corner_l' });
    check(
      'M2.10 средняя стена без длины: замер 2.0 называет её словами и П не собирает; прежний замер «склеивал» соседей (стены 1 и 3 углом) — это его поведение, без человека не меняется',
      v2.refusal !== null && /Стена 2: длина не замерена/.test(v2.refusal) && old.refusal === null && old.chain.join(',') === 'w1,w3',
      `2.0: «${v2.refusal}» · прежний: ${old.chain.join('→')}`,
    );
  }

  /* ── M2.11 идентификатор стены ── */
  {
    const three = surveyOf([{ length: 3000 }, { length: 2000 }, { length: 1500 }]);
    const without = withoutWall(three, 'w2');
    check(
      'M2.11 стену 2 удалили из трёх — новая стена получает w4, а не второй w3; «ряд здесь» не теряется',
      nextWallId(without.walls) === 'w4' && without.walls.some((w) => w.isRunWall),
      `новая ${nextWallId(without.walls)} · ряд на ${without.walls.find((w) => w.isRunWall)?.id}`,
    );
  }

  /* ── M2.12 комната с выступом ── */
  {
    const room = surveyOf([
      { length: 4000, turn: 'right' },
      { length: 3000, turn: 'right' },
      { length: 1500, turn: 'right' },
      { length: 1200, turn: 'left' },
      { length: 2500, turn: 'right' },
      { length: 1800, turn: 'right' },
    ]);
    const built = buildFromSurvey({ title: 'Г-комната с выступом', survey: room, shape: 'corner_l' });
    const placed = surveyWalk(room.walls);
    const planSigns = room.walls.map((w, i) => {
      const next = room.walls[(i + 1) % room.walls.length];
      return turnSign(planCorner(room, w.id, next.id));
    });
    const worldSigns = built.room
      ? room.walls.map((w, i) => {
          const next = room.walls[(i + 1) % room.walls.length];
          return built.room!.walls.some((x) => x.id === w.id) && built.room!.walls.some((x) => x.id === next.id)
            ? turnSign(worldCorner(built.room!, w.id, next.id))
            : 0;
        })
      : [];
    const closes = Math.hypot(placed[placed.length - 1].to.x, placed[placed.length - 1].to.y) < 1;
    const outer = buildFromSurvey({
      title: 'Г через выступ',
      survey: { ...room, walls: room.walls.map((w) => ({ ...w, isRunWall: w.id === 'w4' })) },
      shape: 'corner_l',
    });
    check(
      'M2.12 комната с выступом (6 стен, один угол налево): все 6 стен в 3D, у каждого угла сторона та же, что на плане (стена за выступом поворачивает в другую сторону); Г у внутреннего угла собирается, через выступ — отказ словами',
      closes && built.refusal === null && built.room?.walls.length === 6 && worldSigns.length === 6 && worldSigns.every((sign, i) => sign === planSigns[i]) &&
        outer.refusal !== null && /наружный/.test(outer.refusal),
      `стен ${built.room?.walls.length ?? 0} · план ${planSigns.join(' ')} · 3D ${worldSigns.join(' ')} · через выступ: «${outer.refusal}»`,
    );
  }

  /* ── M2.13 прежний правый замер = замер 2.0 ── */
  {
    const shapes: [string, (number | null)[], 'corner_l' | 'u_shape' | 'linear'][] = [
      ['прямая 3800', [3800], 'linear'],
      ['Г 3800 + 1140', [3800, 1140], 'corner_l'],
      ['П 3800 + 2400 + 1740', [3800, 2400, 1740], 'u_shape'],
      ['П 3600 + 2800 + 3600', [3600, 2800, 3600], 'u_shape'],
    ];
    const rows = shapes.map(([title, lengths, shape]) => {
      const walls = lengths.map((length) => ({ length }));
      const old = buildFromSurvey({ title, survey: surveyOf(walls, { version: false }), shape });
      const now = buildFromSurvey({ title, survey: surveyOf(walls), shape });
      return { title, same: old.refusal === now.refusal && furniture(old) === furniture(now) && old.total === now.total, old, now };
    });
    check(
      'M2.13 замер с поворотами направо до 2.0 и в 2.0 — одна мебель и один итог (прямая, Г, две П): у объектов, где мебель и так стояла по замеру, ничего не едет',
      rows.every((row) => row.same),
      rows.map((row) => `${row.title}: ${row.same ? `та же (${row.now.total})` : `ДРУГАЯ ${row.old.total} → ${row.now.total} ${row.old.refusal ?? ''} ${row.now.refusal ?? ''}`}`).join(' | '),
    );
  }

  /* ── цепочка: окно сдвигается назад у незамкнутого обхода ── */
  {
    const walk = canonicalWalk(surveyOf([{ length: 2360, turn: 'left', run: true }, { length: 2540 }]));
    const chain = kitchenChain(walk, 'w1', 2);
    check(
      'M2.14 Г обходом налево с «ряд здесь» на стене 1: за ней по часовой стены нет — окно цепочки сдвигается назад, и кухня встаёт в угол стен 1 и 2 (А — стена 2)',
      chain.refusal === null && chain.chain.join(',') === 'w2,w1' && walk.reversed,
      `${chain.refusal ?? chain.chain.join('→')}, развёрнут ${walk.reversed}`,
    );
  }

  /* ── M2.15 план Studio против мира ── */
  {
    const window: SurveyOpening = {
      id: 'win-a',
      kind: 'window',
      fromCornerMm: measured(500),
      widthMm: measured(900),
      heightMm: measured(1400),
      sillMm: measured(900),
    };
    const water = (wallId: string, at: number): SurveyComm => ({ id: `water-${wallId}`, kind: 'water_supply', wallId, fromCornerMm: measured(at), heightMm: measured(500) });
    const cases: { title: string; survey: Survey; shape: 'corner_l' | 'u_shape' }[] = [
      {
        title: 'Г налево (объект заказчика)',
        survey: surveyOf([{ length: 2360, turn: 'left', run: true, openings: [window] }, { length: 2540 }], { comms: [water('w1', 700), water('w2', 1900)] }),
        shape: 'corner_l',
      },
      {
        title: 'Г направо',
        survey: surveyOf([{ length: 2360, turn: 'right', run: true, openings: [window] }, { length: 2540 }], { comms: [water('w1', 700), water('w2', 1900)] }),
        shape: 'corner_l',
      },
      ...L_TILES.map((tile) => ({
        title: `Г ${tile.glyph}`,
        survey: tileSurvey(BASE, { kind: 'L', rotation: tile.rotation }, [2360, 2540]),
        shape: 'corner_l' as const,
      })),
      { title: 'П', survey: surveyOf([{ length: 2800 }, { length: 3200, openings: [window] }, { length: 1800 }], { comms: [water('w2', 1200)] }), shape: 'u_shape' },
      {
        title: 'П налево',
        survey: surveyOf([{ length: 2800, turn: 'left' }, { length: 3200, turn: 'left', openings: [window] }, { length: 1800 }], { comms: [water('w2', 1200)] }),
        shape: 'u_shape',
      },
      {
        title: 'прежний Г налево',
        survey: surveyOf([{ length: 2360, turn: 'left', run: true, openings: [window] }, { length: 2540 }], { version: false }),
        shape: 'corner_l',
      },
    ];
    const rows = cases.map((item) => {
      const built = buildFromSurvey({ title: item.title, survey: item.survey, shape: item.shape });
      if (built.refusal) throw new Error(`M2.15 ${item.title}: ${built.refusal}`);
      return { title: item.title, ...planAgainstWorld(built, item.survey) };
    });
    const openings = rows.reduce((sum, row) => sum + row.openings, 0);
    const comms = rows.reduce((sum, row) => sum + row.comms, 0);
    check(
      'M2.15 план Studio (RoomPlan, путь экрана) против мира: у каждого модуля обеих стен угла отрезок от угла на плане = в 3D, полоса на линии своей стены и со стороны комнаты; окно — там же, что в 3D; точка воды — на своём расстоянии от левого угла (Г налево и направо, четыре плитки Г, П направо и налево, прежний Г)',
      rows.every((row) => row.bad.length === 0 && row.modules > 0) && openings === 5 && comms === 6,
      rows
        .map((row) => `${row.title}: модулей ${row.modules}, проёмов ${row.openings}, точек ${row.comms}${row.bad.length ? ` · НЕ ТАК ${row.bad.length}: ${row.bad.slice(0, 3).join('; ')}` : ''}`)
        .join(' | ') + ` · всего проёмов ${openings}, точек ${comms}`,
    );
  }

  /* ── M2.16 план шага замера ── */
  {
    const window: SurveyOpening = {
      id: 'win-run',
      kind: 'window',
      fromCornerMm: measured(400),
      widthMm: measured(800),
      heightMm: measured(1400),
      sillMm: measured(900),
    };
    const cases: [string, Survey, string][] = [
      ['Г налево, ряд на стене 1', surveyOf([{ length: 3200, turn: 'left', run: true, openings: [window] }, { length: 2540 }]), 'w2'],
      ['Г направо, ряд на стене 1', surveyOf([{ length: 3200, turn: 'right', run: true, openings: [window] }, { length: 2540 }]), 'w2'],
      ['Г налево, ряд на стене 2', surveyOf([{ length: 2540, turn: 'left', run: false }, { length: 3200, run: true, openings: [window] }]), 'w1'],
      ['Г ┘', tileSurvey(BASE, { kind: 'L', rotation: 90 }, [3200, 2540]), 'w2'],
    ];
    const rows = cases.map(([title, survey, other]) => ({ title, ...surveyStepPlan(survey, other) }));
    check(
      'M2.16 план шага замера (SurveyPlan): предварительный ряд стены ряда идёт от её левого угла (стоя лицом к стене) и лежит полосой в комнате, окно — на своей привязке от левого угла; у обхода налево — тоже',
      rows.every((row) => row.bad.length === 0 && row.modules > 0) && rows.filter((row) => row.openings > 0).length === 3,
      rows.map((row) => `${row.title}: модулей ${row.modules}, проёмов ${row.openings}${row.bad.length ? ` · НЕ ТАК: ${row.bad.slice(0, 3).join('; ')}` : ''}`).join(' | '),
    );
  }

  /* ── M2.17 начало ряда у угла, который ведёт следующая стена ── */
  {
    const survey = surveyOf([{ length: 3600 }, { length: 3200 }, { length: 3600 }]);
    const built = buildFromSurvey({
      title: 'П, низ угла Б–В ведёт стена В',
      survey,
      shape: 'u_shape',
      corners: [
        { walls: ['w1', 'w2'], lower: 'blind', upper: 'blind' },
        { walls: ['w2', 'w3'], lower: 'blind', upper: 'blind', owners: { lower: 'next' } },
      ],
    });
    if (built.refusal) throw new Error(`M2.17: ${built.refusal}`);
    const result = planAgainstWorld(built, survey);
    const b = built.segments[1];
    const rowStart = built.room?.walls.find((w) => w.id === 'w2')?.rowStartMm;
    check(
      'M2.17 П, низ угла Б–В ведёт стена В (P0): ряд Б кончается раньше угла, и план ставит его с того миллиметра, что и 3D (начало — угол перед рядом, а не «длина стены минус длина ряда»)',
      result.bad.length === 0 && result.modules > 0 && rowStart !== undefined && 3200 - b.lengthMm > rowStart,
      `ряд Б ${b.lengthMm} мм на стене 3200: начало ${rowStart}, прежняя формула ${3200 - b.lengthMm} · модулей ${result.modules}${result.bad.length ? ` · НЕ ТАК: ${result.bad.slice(0, 3).join('; ')}` : ''}`,
    );
  }

  /* ── M2.19–M2.21 отражение мебели и перевод прежнего замера ── */
  mirrorChecks(check);

  /* ── M2.22 точная отметка и M2.23 модуль на другую стену ── */
  placementChecks(check);

  /* ── M2.24–M2.28 антресоли: до потолка с зазором, в линию с высоким блоком, углы ── */
  mezzanineChecks(check);

  /* ── M2.29–M2.31 три эталонные кухни ── */
  kitchenChecks(check);

  /* ── M2.18 П в четырёх положениях ── */
  {
    const rows = U_TILES.map((tile) => {
      const survey = tileSurvey(BASE, { kind: 'U', rotation: tile.rotation }, [2800, 3200, 1800]);
      const built = buildFromSurvey({ title: `П ${tile.glyph}`, survey, shape: 'u_shape' });
      const ab = sides(built, survey, 'w1', 'w2');
      const bc = sides(built, survey, 'w2', 'w3');
      return {
        tile,
        survey,
        built,
        ok: built.refusal === null && built.chain.join(',') === 'w1,w2,w3' && ab.plan === ab.world && bc.plan === bc.world,
      };
    });
    const totals = new Set(rows.map((row) => row.built.total));
    const same = new Set(rows.map((row) => furniture(row.built)));
    check(
      'M2.18 П в четырёх положениях (⊓ ⊔ ⊏ ⊐), 2800 + 3200 + 1800: каждая на стенах А, Б, В, сторона у обоих углов на плане и в 3D одна, план повёрнут как плитка; это одна кухня — мебель и итог те же',
      rows.every((row) => row.ok && row.survey.planRotationDeg === row.tile.rotation) && totals.size === 1 && same.size === 1,
      rows.map((row) => `${row.tile.glyph}: ${row.built.refusal ?? row.built.chain.join('→')} · ${row.survey.planRotationDeg}° · ${row.ok ? 'сторона одна' : 'НЕ ТАК'}`).join(' | ') +
        ` · итогов ${totals.size}, мебели ${same.size}`,
    );
  }
}

/* Отдельный запуск — свой счёт. */
const direct = process.argv[1] && /verify-measurement-v2\.ts$/.test(process.argv[1]);
if (direct) {
  let passed = 0;
  let failed = 0;
  measurementV2Checks((name, condition, detail) => {
    if (condition) passed += 1;
    else failed += 1;
    console[condition ? 'log' : 'error'](`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
