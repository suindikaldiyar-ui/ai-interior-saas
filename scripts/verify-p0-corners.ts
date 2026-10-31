/**
 * ПРИЁМКА P0 — НАСТОЯЩИЕ Г- И П-ОБРАЗНЫЕ УГЛЫ (ТЗ ALDIK STUDIO 2026-10-25, § 1,
 * матрица проверок 1–13). Входит в `test:millwork`; отдельно —
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-p0-corners.ts`.
 *
 * Путь экрана — фикстура STAGE A (`buildObject`: `objectSite` →
 * `compositionFor` → `objectInput` → `composeVariants` → `wallSegments` →
 * `runPlacements`). Меряется нарисованное: коробки всех модулей в мире
 * (`runBoxesByModule`), ход створок и дверец пары (`leafPoses`,
 * `lPairPoses`), плиты столешницы (`countertopSlabs`), а не поля данных.
 *
 *   P0.1  прямая 3800 — ряд во всю стену, пересечений нет;
 *   P0.2  Г 3800 + 2400, ведёт стена А — А до угла, Б после её контура;
 *   P0.3  та же Г, ведёт стена Б — Б до угла, А до неё; отпечаток и ширины другие;
 *   P0.4  Г-модуль: один корпус на обе стены, ноги в раскрое, у стены Б — зеркально;
 *   P0.5–7 П 3600 + 2800 + 3600: оба угла А, оба Б, смешанные — собираются, заходы названы;
 *   P0.8  П с Г-модулями: смена левого угла не трогает правый;
 *   P0.9  П 3800 + 1140 + 1740 — отказ словами при любом владельце, замер 1140 не подменён;
 *   P0.10 П 3800 + 2400 + 1740 (600/300) — собирается, заходов нет;
 *   P0.11 низ ведёт А, верх — Б; антресоль третьим владельцем; плита — одна в углу;
 *   P0.12 петли слева → справа: ось, ручка, 2D, сохранение, смета, ход у угла;
 *   P0.13 видео: верхний Г-шкаф с двумя дверцами на своих петлях и Г-полками.
 */
import { buildObject, compositionAttemptOf, L_MODULE, NEW_CORNER, SCHOOL_600, U_DIRECTIVE, type Spec } from './corner-quality-fixture';
import {
  L_PAIR_FIRST_LEG,
  doorHinge,
  lPairPoses,
  lPairStroke,
  lPairTarget,
  closedFrontRect,
  leafOpenAngle,
  leafPoses,
  legOptions,
  openablePartIds,
  runBoxesByModule,
  runPlaces,
  sceneLeaves,
  type PartBox,
  type PosedBox,
} from '../lib/millwork/cabinetBoxes';
import { choiceOfCorner, clashWords, cornerKinematics, stuckWords, type RowPlace } from '../lib/millwork/cornerKinematics';
import { applyOps } from '../lib/millwork/ops';
import { buildPanels, FACADE_PANEL_NAME, legName, SHELF_PANEL_NAME } from '../lib/millwork/panels';
import { buildEstimate } from '../lib/millwork/estimate';
import { configurationFingerprint } from '../lib/millwork/fingerprint';
import { allModules } from '../lib/millwork/layout';
import { cornerGeometry, levelBoundsOf, lowerGapMm } from '../lib/millwork/corner';
import { counterMitersOf, countertopSlabs } from '../lib/millwork/countertop';
import { counterSlabDepthMm, rowStandardDepthMm } from '../lib/millwork/fill';
import { shopOf } from '../lib/millwork/shop';
import { changeCorner, cornerDoorCards, cornerOwnerCards, describeRebuild } from '../lib/millwork/cornerChange';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { withFitting } from '../lib/millwork/fittings';
import { DEMO_RATES } from '../lib/millwork/demo';
import { lowerWall, wallLabel } from '../lib/millwork/walls';
import { DEFAULT_PRODUCTION, type CatalogEntryFull, type ProductionSettings } from '../types/catalog';
import type { CornerChoice, Module, Run } from '../types/millwork';

type Check = (name: string, condition: boolean, detail?: string) => void;

const MM = 1000;
type V3 = [number, number, number];
type Box = { min: V3; max: V3; tag: string };
type Built = ReturnType<typeof buildObject>;

/* ─────────────────────────  мир  ───────────────────────── */

function toWorld(place: RowPlace, [x, y, z]: V3): V3 {
  const a = (place.rotationYDeg * Math.PI) / 180;
  return [(x * Math.cos(a) + z * Math.sin(a) + place.xM) * MM, y * MM, (-x * Math.sin(a) + z * Math.cos(a) + place.zM) * MM];
}

/** Коробка ряда (центр, габарит — метры) → габарит в мире, мм. Повороты рядов кратны 90°. */
function worldBox(place: RowPlace, position: V3, scale: V3, tag: string): Box {
  const corners: V3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(toWorld(place, [position[0] + (sx * scale[0]) / 2, position[1] + (sy * scale[1]) / 2, position[2] + (sz * scale[2]) / 2]));
      }
    }
  }
  return {
    min: [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]))) as V3,
    max: [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]))) as V3,
    tag,
  };
}

/** Насколько габариты входят друг в друга, мм: меньше нуля — зазор. */
function depthOf(a: Pick<Box, 'min' | 'max'>, b: Pick<Box, 'min' | 'max'>): number {
  return Math.min(...[0, 1, 2].map((k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k])));
}

function boxOptions(production: ProductionSettings) {
  const shop = shopOf(production);
  return { thicknessMm: shop.carcassMm, frontThicknessMm: shop.frontMm, gapMm: shop.frontGapMm, production: shop };
}

/** Все коробки всех модулей и фальш-панелей объекта — в мире, с хозяином. */
function solidsOf(runs: Run[], places: RowPlace[], production: ProductionSettings) {
  const out: { box: Box; owner: string; wall: number; part: PartBox }[] = [];
  runs.forEach((run, wall) => {
    const grouped = runBoxesByModule(run, boxOptions(production));
    for (const box of grouped.fillers) {
      out.push({ box: worldBox(places[wall], box.position, box.scale, `стена ${wall + 1} ${box.panel ?? 'добор'}`), owner: `filler:${wall}:${box.position.join()}`, wall, part: box });
    }
    for (const { unit, boxes } of grouped.modules) {
      for (const box of boxes) {
        out.push({ box: worldBox(places[wall], box.position, box.scale, `стена ${wall + 1} ${unit.id} ${box.panel ?? box.node ?? box.material}`), owner: unit.id, wall, part: box });
      }
    }
  });
  return out;
}

/** Деталь одного модуля входит в деталь другого — на своей стене и на чужой. */
function hitsOf(runs: Run[], places: RowPlace[], production: ProductionSettings): { hits: string[]; pairs: number } {
  const solids = solidsOf(runs, places, production);
  const hits: string[] = [];
  let pairs = 0;
  for (let i = 0; i < solids.length; i += 1) {
    for (let j = i + 1; j < solids.length; j += 1) {
      const a = solids[i];
      const b = solids[j];
      if (a.owner === b.owner) continue;
      pairs += 1;
      const depth = depthOf(a.box, b.box);
      if (depth > 0.5) hits.push(`${a.box.tag} × ${b.box.tag} на ${depth.toFixed(1)} мм`);
    }
  }
  return { hits, pairs };
}

const lower = (run: Run) => run.modules;
const uppers = (run: Run) => run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => unit.section !== 'mezzanine' && !unit.overhead);
const widths = (list: Module[]) => [...list].sort((a, b) => a.offsetMm - b.offsetMm).map((unit) => unit.widthMm).join(',');
const sumOf = (list: Module[]) => list.reduce((sum, unit) => sum + unit.widthMm, 0);
const wallOf = (wall: number) => lowerWall(wallLabel(wall), 'genitive');

/** Ряды объекта по стенам — ровно как их держит экран. */
function rowsOf(object: Built): Run[] {
  return object.engine.segments;
}

/** Требования стены: её доля приборов из композиции (ловушка 352) — как у правки экрана. */
function wallRequirements(object: Built, wall: number) {
  const segment = object.engine.layout?.segments[wall];
  return segment ? { ...object.requirements, appliances: segment.appliances } : object.requirements;
}

/** Плиты столешницы ряда — в мире, мм: от стены до свеса, вдоль ряда по `countertopSlabs`. */
function slabsOf(run: Run, place: RowPlace, production: ProductionSettings): Box[] {
  const back = -rowStandardDepthMm(run.zone, 'base', production) / MM;
  const front = back + counterSlabDepthMm(run.zone, production) / MM;
  return countertopSlabs(run).map((slab) =>
    worldBox(
      place,
      [(slab.fromMm + slab.toMm) / 2 / MM, 0.9, (back + front) / 2],
      [(slab.toMm - slab.fromMm) / MM, 0.038, front - back],
      `плита ${slab.fromMm}…${slab.toMm}`,
    ),
  );
}

/* ─────────────────────────  каталог: петля 110°  ───────────────────────── */

function hingeCatalog(angleDeg: number) {
  const fact = HARDWARE_FACTS.find((f) => f.hardware.openingAngleDeg === angleDeg);
  if (!fact) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: петли ${angleDeg}° в фактах нет`);
  const row = hardwareCatalogRow(fact);
  const entry = {
    id: `hw:${fact.article}`,
    org_id: 'org-p0',
    category_id: 'cat-hardware',
    article: row.article,
    name_ru: row.name_ru,
    name_kk: row.name_kk,
    description: '',
    price: row.price,
    unit: row.unit,
    dimensions: {},
    tiling: {},
    meta: { hardware: fact.hardware },
    is_active: true,
    assets: [],
  } as unknown as CatalogEntryFull;
  return { catalog: hardwareCatalog([entry]), itemId: `hw:${fact.article}`, title: `${row.article} (${angleDeg}°)` };
}

/* ─────────────────────────  объекты  ───────────────────────── */

const NEXT: CornerChoice = { ...NEW_CORNER, owners: { lower: 'next', upper: 'next' } };
const L_NEXT: CornerChoice = { ...L_MODULE, owners: { lower: 'next', upper: 'next' } };
const PAIR: CornerChoice = { ...L_MODULE, upperDoors: 'pair' };

const G = (key: string, corners: CornerChoice[], production?: ProductionSettings): Spec => ({
  key,
  title: `Г 3800 + 2400 · ${key}`,
  lengths: [3800, 2400],
  shape: 'corner_l',
  corners,
  ...(production ? { production } : {}),
});
const U = (key: string, corners: CornerChoice[], lengths = [3600, 2800, 3600], production?: ProductionSettings): Spec => ({
  key,
  title: `П ${lengths.join(' + ')} · ${key}`,
  lengths,
  shape: 'u_shape',
  corners,
  ...(production ? { production } : {}),
});

export function p0CornerChecks(check: Check): void {
  const production = DEFAULT_PRODUCTION;

  /* ═════════════ P0.1 Прямая 3800 ═════════════ */
  {
    const object = buildObject({ key: 'straight', title: 'прямая 3800', lengths: [3800], shape: 'linear', corners: [] });
    const [row] = rowsOf(object);
    const { hits, pairs } = hitsOf(rowsOf(object), object.engine.places, production);
    check(
      'P0.1 прямая 3800: ряд во всю стену, сумма модулей = стене, ни одна деталь не входит в другую',
      row.lengthMm === 3800 && sumOf(lower(row)) === 3800 && hits.length === 0 && pairs > 0,
      `ряд ${row.lengthMm} · модулей ${sumOf(lower(row))} мм · пар ${pairs} · ${hits.slice(0, 2).join(' | ') || 'входов 0'}`,
    );
  }

  /* ═════════════ P0.2 / P0.3 Г: ведёт стена А, ведёт стена Б ═════════════ */
  const gPrev = buildObject(G('ведёт А', [NEW_CORNER]));
  const gNext = buildObject(G('ведёт Б', [NEXT]));
  {
    const measured = (object: Built) => (object.engine.layout?.segments ?? []).map((s) => s.wallLengthMm).join('+');
    const [aPrev, bPrev] = rowsOf(gPrev);
    const [aNext, bNext] = rowsOf(gNext);
    const gap = cornerGeometry(NEW_CORNER, aPrev.zone, production).lostMm;
    const prevHits = hitsOf(rowsOf(gPrev), gPrev.engine.places, production);
    const nextHits = hitsOf(rowsOf(gNext), gNext.engine.places, production);
    check(
      'P0.2 Г 3800 + 2400, ведёт А: замер стен не тронут, ряд А до стены Б, ряд Б начинается за контуром А, сумма модулей = ряду, входов 0',
      measured(gPrev) === '3800+2400' &&
        lowerGapMm(aPrev, 'end') === 0 &&
        aPrev.lengthMm === 3800 &&
        lowerGapMm(bPrev, 'start') === gap &&
        bPrev.lengthMm === 2400 - gap &&
        sumOf(lower(aPrev)) === aPrev.lengthMm &&
        sumOf(lower(bPrev)) === bPrev.lengthMm &&
        prevHits.hits.length === 0,
      `замер ${measured(gPrev)} · А ${aPrev.lengthMm} (до стены) · Б ${bPrev.lengthMm} = 2400 − ${lowerGapMm(bPrev, 'start')} · пар ${prevHits.pairs} · ${prevHits.hits.slice(0, 2).join(' | ') || 'входов 0'}`,
    );
    check(
      'P0.3 та же Г, ведёт Б: Б до стены А, А кончается до неё; замер тот же; отпечаток и ширины модулей другие; входов 0',
      measured(gNext) === '3800+2400' &&
        lowerGapMm(bNext, 'start') === 0 &&
        bNext.lengthMm === 2400 &&
        lowerGapMm(aNext, 'end') === gap &&
        aNext.lengthMm === 3800 - gap &&
        sumOf(lower(aNext)) === aNext.lengthMm &&
        sumOf(lower(bNext)) === bNext.lengthMm &&
        gPrev.engine.layout?.fingerprint !== gNext.engine.layout?.fingerprint &&
        (widths(lower(aPrev)) !== widths(lower(aNext)) || widths(lower(bPrev)) !== widths(lower(bNext))) &&
        nextHits.hits.length === 0,
      `А ${aNext.lengthMm} · Б ${bNext.lengthMm} (до стены) · отпечаток ${gPrev.engine.layout?.fingerprint} → ${gNext.engine.layout?.fingerprint} · ` +
        `низ А ${widths(lower(aPrev))} → ${widths(lower(aNext))} · ${nextHits.hits.slice(0, 2).join(' | ') || 'входов 0'}`,
    );
  }

  /* ═════════════ P0.4 Г-модуль: один корпус на обе стены ═════════════ */
  {
    const lines: string[] = [];
    let ok = true;
    for (const [title, corners] of [
      ['ведёт А', [L_MODULE]],
      ['ведёт Б', [L_NEXT]],
    ] as const) {
      const object = buildObject(G(`Г-модуль ${title}`, [...corners]));
      const runs = rowsOf(object);
      const owner = title === 'ведёт А' ? 0 : 1;
      const run = runs[owner];
      const base = lower(run).filter((unit) => unit.kind === 'corner_base');
      const upper = uppers(run).filter((unit) => unit.kind === 'corner_upper');
      const others = runs.flatMap((r, i) => (i === owner ? [] : allModules(r))).filter((unit) => unit.kind === 'corner_base' || unit.kind === 'corner_upper');
      const panels = buildPanels({ run, production }).filter((panel) => panel.moduleId === base[0]?.id);
      const legs = panels.filter((panel) => panel.name.endsWith('(нога Б)'));
      const side = base[0] ? legOptions(base[0], run).legSide ?? 'right' : '—';
      const { hits } = hitsOf(runs, object.engine.places, production);
      const good =
        base.length === 1 &&
        upper.length === 1 &&
        others.length === 0 &&
        legs.length >= 3 &&
        side === (owner === 0 ? 'right' : 'left') &&
        hits.length === 0;
      ok &&= good;
      lines.push(
        `${title}: Г-модулей низ ${base.length} верх ${upper.length} на стене ${owner + 1}, у соседа ${others.length}; деталей ноги Б ${legs.length}; нога ${side}; ${hits.slice(0, 1).join('') || 'входов 0'}`,
      );
    }
    check('P0.4 Г-модуль — один корпус на обе стены: ноги А и Б в раскрое, у стены Б — зеркально (нога слева), двойного корпуса нет', ok, lines.join(' · '));
  }

  /* ═════════════ P0.5–P0.7 П 3600 + 2800 + 3600: оба угла А, оба Б, смешанные ═════════════ */
  {
    const combos: [string, CornerChoice[]][] = [
      ['А·Б', [NEW_CORNER, NEW_CORNER]],
      ['Б·В', [NEXT, NEXT]],
      ['А·В', [NEW_CORNER, NEXT]],
      ['Б·Б', [NEXT, NEW_CORNER]],
    ];
    const prints = new Set<string>();
    const lines: string[] = [];
    let ok = true;
    for (const [key, corners] of combos) {
      const object = buildObject(U(key, corners));
      const runs = rowsOf(object);
      const { hits } = hitsOf(runs, object.engine.places, production);
      const clashes = object.engine.layout?.cornerClashes ?? [];
      prints.add(object.engine.layout?.fingerprint ?? '');
      /* Каждая стена в своей длине замера; заход, который панелью не снять, — словами с мм. */
      const named = clashes.every((note) => /\d+(,\d)? мм/.test(note.words) && note.words.length > 40);
      const good = hits.length === 0 && named && (object.engine.layout?.segments ?? []).map((s) => s.wallLengthMm).join('+') === '3600+2800+3600';
      ok &&= good;
      lines.push(`${key}: ${object.engine.layout?.fingerprint} · входов ${hits.length} · заходов ${clashes.length}${clashes[0] ? ` («${clashes[0].words.slice(0, 70)}…»)` : ''}`);
    }
    check(
      'P0.5–7 П 3600 + 2800 + 3600: оба угла ведёт стена до угла, оба — после, смешанные; все собираются, отпечатки разные, входов 0, заходы названы словами с мм',
      ok && prints.size === combos.length,
      `отпечатков ${prints.size} из ${combos.length} · ${lines.join(' | ')}`,
    );
  }

  /* ═════════════ P0.8 П с Г-модулями: смена левого угла не меняет правый ═════════════ */
  {
    const spec = U('Г-модули', [L_MODULE, L_MODULE]);
    const before = buildObject(spec);
    const runs = rowsOf(before);
    const corners = before.engine.layout!.corners.map((corner) => corner.choice);
    const next: CornerChoice = { ...L_MODULE, owners: { lower: 'next' } };
    const recompose = (choices: CornerChoice[]) => {
      try {
        return { runs: rowsOf(buildObject({ ...spec, corners: choices })) };
      } catch (error) {
        return { why: (error as Error).message };
      }
    };
    const change = changeCorner({
      runs,
      index: 0,
      next,
      corners,
      requirements: before.requirements,
      wallOpenings: spec.lengths.map(() => []),
      labels: runs.map((_, i) => wallLabel(i)),
      recompose,
    });
    const sig = (run: Run | undefined) =>
      run ? allModules(run).map((unit) => `${unit.kind}:${unit.offsetMm}:${unit.widthMm}`).sort().join('|') : '—';
    const ok =
      change.ok &&
      JSON.stringify(change.corners[1]) === JSON.stringify(corners[1]) &&
      sig(change.runs[2]) === sig(runs[2]) &&
      (change.rebuild ?? []).every((wall) => wall === 0 || wall === 1) &&
      lowerGapMm(change.runs[1], 'end') === lowerGapMm(runs[1], 'end') &&
      sig(change.runs[0]) !== sig(runs[0]);
    check(
      'P0.8 П 3600 + 2800 + 3600 с Г-модулями: смена владельца низа левого угла пересобирает стены А и Б, правый угол, стена В и конец стены Б те же',
      ok,
      change.ok
        ? `пересобраны ${(change.rebuild ?? []).join(',')} · угол 2 ${JSON.stringify(change.corners[1]) === JSON.stringify(corners[1]) ? 'тот же' : 'ИЗМЕНИЛСЯ'} · стена В ${sig(change.runs[2]) === sig(runs[2]) ? 'та же' : 'ИЗМЕНИЛАСЬ'} · угол Б–В у стены Б ${lowerGapMm(change.runs[1], 'end')} = ${lowerGapMm(runs[1], 'end')} мм`
        : `отказ: ${change.why}`,
    );
  }

  /* ═════════════ P0.9 П 3800 + 1140 + 1740 — отказ при любом владельце ═════════════ */
  {
    const lines: string[] = [];
    let ok = true;
    for (const [key, corners] of [
      ['А·Б', [NEW_CORNER, NEW_CORNER]],
      ['Б·В', [NEXT, NEXT]],
      ['А·В', [NEW_CORNER, NEXT]],
    ] as [string, CornerChoice[]][]) {
      const attempt = compositionAttemptOf({ ...U_DIRECTIVE, corners });
      const refused = attempt?.state === 'refused' ? attempt.reason : '';
      const good = refused.includes('1140') && refused.includes('1152') && refused.includes('12 мм');
      ok &&= good;
      lines.push(`${key}: ${good ? 'отказ 1140 / 1152 / 12 мм' : `НЕТ ОТКАЗА (${attempt?.state})`}`);
    }
    check(
      'P0.9 П 3800 + 1140 + 1740: физически не собирается — отказ словами с 1140 / 1152 / 12 мм при любом владельце углов, стена Б не подменяется',
      ok,
      lines.join(' · '),
    );
  }

  /* ═════════════ P0.10 П 3800 + 2400 + 1740 (600/300) — рабочая ═════════════ */
  {
    const object = buildObject(U('рабочая', [NEW_CORNER, NEW_CORNER], [3800, 2400, 1740], SCHOOL_600));
    const runs = rowsOf(object);
    const { hits } = hitsOf(runs, object.engine.places, SCHOOL_600);
    const clashes = object.engine.layout?.cornerClashes ?? [];
    const panel = object.engine.layout?.corners.map((corner) => corner.ownerPanelMm ?? 0) ?? [];
    check(
      /* F9: 12 → 14 мм — фронт ящика под варочной стены Б ходит настоящей деталью «ширина − зазор» (см. SA.7). */
      'P0.10 П 3800 + 2400 + 1740 (600/300): собирается, заходов у углов нет (панель по ходу 14 мм), входов 0',
      clashes.length === 0 && hits.length === 0 && panel.includes(14),
      `заходов ${clashes.length} · входов ${hits.length} · панели владельца ${panel.join(', ')} мм · отпечаток ${object.engine.layout?.fingerprint}`,
    );
  }

  /* ═════════════ P0.11 Разные владельцы по уровням, антресоль, одна плита в углу ═════════════ */
  {
    const mixed: CornerChoice = { ...NEW_CORNER, owners: { upper: 'next' } };
    const object = buildObject(G('низ А, верх Б', [mixed]));
    const [a, b] = rowsOf(object);
    const places = object.engine.places;
    const { hits } = hitsOf([a, b], places, production);
    const upperA = levelBoundsOf(a, 'upper');
    const upperB = levelBoundsOf(b, 'upper');
    /* Плита — свой контур: у владельца низа (умолчание плиты), один стык, плиты не входят друг в друга. */
    const slabsA = slabsOf(a, places[0], production);
    const slabsB = slabsOf(b, places[1], production);
    let slabOverlap = 0;
    for (const sa of slabsA) for (const sb of slabsB) slabOverlap = Math.max(slabOverlap, depthOf(sa, sb));
    const miters = counterMitersOf(a) + counterMitersOf(b);
    check(
      'P0.11 один угол: низ ведёт стена А, верх — стена Б; ряды не входят друг в друга; плита одна в углу (стык один, плиты не перекрываются)',
      lowerGapMm(a, 'end') === 0 &&
        lowerGapMm(b, 'start') > 0 &&
        upperA.toMm < a.lengthMm &&
        upperB.fromMm < 0 &&
        hits.length === 0 &&
        miters === 1 &&
        slabOverlap <= 0.5,
      `низ А до стены, Б за ${lowerGapMm(b, 'start')} мм · верх А до ${upperA.toMm} из ${a.lengthMm} · верх Б от ${upperB.fromMm} · входов ${hits.length} · стыков плиты ${miters} · перекрытие плит ${Math.max(0, slabOverlap).toFixed(1)} мм`,
    );

    /* Антресоль третьим сценарием: верх ведёт Б, антресоль — А. Ставится на оба ряда той же операцией экрана. */
    const third: CornerChoice = { ...NEW_CORNER, owners: { upper: 'next', mezzanine: 'prev' }, mezzanine: 'blind' };
    const object3 = buildObject(G('антресоль А', [third]));
    const rows3 = rowsOf(object3).map((run, wall) =>
      applyOps({ run, requirements: wallRequirements(object3, wall), ops: [{ op: 'set_mezzanine', heightMm: 400 }], openings: [], roomDepthMm: 0 }),
    );
    const mezz = rows3.map((run) => run.upperSegments.flatMap((s) => s.modules).filter((unit) => unit.section === 'mezzanine'));
    const mezzA = levelBoundsOf(rows3[0], 'mezzanine');
    const mezzB = levelBoundsOf(rows3[1], 'mezzanine');
    const hits3 = hitsOf(rows3, object3.engine.places, production);
    check(
      'P0.11 антресоль третьим владельцем: верх ведёт Б, антресоль — А; модули антресоли на обеих стенах, ни одна деталь не входит в другую',
      mezz[0].length > 0 && mezz[1].length > 0 && mezzA.toMm >= rows3[0].lengthMm && mezzB.fromMm > upperB.fromMm && hits3.hits.length === 0,
      `антресоль А ${mezz[0].length} мод. до ${mezzA.toMm} · Б ${mezz[1].length} мод. от ${mezzB.fromMm} · ${hits3.hits.slice(0, 2).join(' | ') || 'входов 0'}`,
    );
  }

  /* ═════════════ P0.12 Петли слева → справа ═════════════ */
  {
    const runs = rowsOf(gPrev);
    const wall = 1;
    const run = runs[wall];
    const place = runPlaces(run);
    const single = place
      .filter((entry) => run.modules.includes(entry.unit) && entry.unit.kind === 'base' && !entry.unit.appliance)
      .filter((entry) => {
        const leaves = sceneLeaves(entry.unit, entry.heightM);
        return leaves.length === 1 && leaves[0].kind === 'door';
      })
      .sort((p, q) => p.x - q.x)[0];
    if (!single) {
      check('P0.12 петли слева → справа', false, 'НУЛЕВОЙ СЕЛЕКТОР: у стены Б нет нижнего модуля с одной створкой');
    } else {
      const id = single.unit.id;
      const shop = shopOf(production);
      const states = (['left', 'right'] as const).map((opening) => {
        const edited = applyOps({ run, requirements: wallRequirements(gPrev, wall), ops: [{ op: 'set_opening', moduleId: id, opening }], openings: [], roomDepthMm: 0 });
        const entry = runPlaces(edited).find((e) => e.unit.id === id)!;
        const unit = entry.unit;
        const leaf = sceneLeaves(unit, entry.heightM)[0];
        const handle = runBoxesByModule(edited, boxOptions(production))
          .modules.find((m) => m.unit.id === id)
          ?.boxes.find((box) => box.node === 'handle');
        const center = entry.x + unit.widthMm / MM / 2;
        const open = leaf.kind === 'door'
          ? leafPoses({
              opening: leaf.opening,
              x: leaf.xM,
              y: leaf.bottomM,
              width: leaf.widthM,
              height: leaf.heightM,
              thickness: shop.frontMm / MM,
              gap: shop.frontGapMm / MM,
              s: 1,
              /* Ходит деталь деталировки (F9) — та же, что нарисована закрытой. */
              rect: closedFrontRect(
                runBoxesByModule(edited, boxOptions(production)).modules.find((m) => m.unit.id === id)?.boxes.filter((box) => box.part === leaf.id),
                [entry.x + leaf.xM, entry.y + leaf.bottomM],
              ),
            })[0]
          : null;
        const fp = configurationFingerprint(allModules(edited));
        const back = JSON.parse(JSON.stringify(edited)) as Run;
        const reread = allModules(back).find((u) => u.id === id);
        const hinges = buildEstimate(edited, 'optimal', DEMO_RATES, [], undefined, production).lines.filter((line) => line.key.startsWith('hinge_') && line.key !== 'hinge_corner_175').reduce((sum, line) => sum + line.quantity, 0);
        const rows = runs.map((r, i) => (i === wall ? edited : r));
        const clashes = cornerKinematics({ runs: rows, places: gPrev.engine.places, production: shop }).clashes.filter((clash) => clash.moduleId === id || clash.obstacleModuleId === id);
        return {
          opening,
          leafOpening: leaf.kind === 'door' ? leaf.opening : null,
          hinge2d: doorHinge(unit, 0, 1),
          /* Ручка — на свободном краю: петли слева → ручка правее середины. */
          handleSide: handle ? (handle.position[0] > center ? 'right' : 'left') : '—',
          /* Открытое полотно — у петельного края. */
          openSide: open ? (open.center[0] + entry.x < center ? 'left' : 'right') : '—',
          fp,
          saved: reread?.fill?.hinge === opening && configurationFingerprint(allModules(back)) === fp,
          hinges,
          clashes: clashes.map((clash) => `${clashWords(clash, wallOf)} — ${stuckWords(clash, choiceOfCorner(rows, clash.corner)!, wallOf)}`),
        };
      });
      const [left, right] = states;
      const ok =
        states.every((s) => s.leafOpening === s.opening && s.hinge2d === s.opening && s.saved) &&
        left.handleSide === 'right' &&
        right.handleSide === 'left' &&
        left.openSide === 'left' &&
        right.openSide === 'right' &&
        left.fp !== right.fp &&
        left.hinges === right.hinges &&
        states.every((s) => s.clashes.every((words) => /\d+(,\d)? мм/.test(words)));
      check(
        `P0.12 «${single.unit.label}» стены Б: петли слева → справа — створка сцены, 2D, ось (полотно у петель), ручка на свободном краю, отпечаток, сохранение; петли сметы те же; заход у угла — словами`,
        ok,
        states
          .map((s) => `${s.opening}: сцена ${s.leafOpening} · 2D ${s.hinge2d} · ручка ${s.handleSide} · полотно ${s.openSide} · ${s.fp} · сохранение ${s.saved ? 'то же' : 'НЕ ТО'} · петель ${s.hinges} · заходов ${s.clashes.length}`)
          .join(' | '),
      );
    }
  }

  /* ═════════════ P0.13 Видео: верхний Г-шкаф, две дверцы на своих петлях ═════════════ */
  {
    const object = buildObject(G('две дверцы', [PAIR]));
    const bifold = buildObject(G('книжка', [L_MODULE]));
    const runs = rowsOf(object);
    const run = runs[0];
    const entry = runPlaces(run).find((e) => e.unit.kind === 'corner_upper');
    if (!entry) {
      check('P0.13 видео: верхний Г-шкаф с двумя дверцами', false, 'НУЛЕВОЙ СЕЛЕКТОР: верхнего Г-модуля на стене А нет');
      return;
    }
    const unit = entry.unit;
    const shop = shopOf(production);
    const placeM = { x: entry.x, y: entry.y, heightM: entry.heightM, depthM: entry.depthM, thicknessM: shop.carcassMm / MM, zM: entry.zM };
    const options = { gapM: shop.frontGapMm / MM, frontThicknessM: shop.frontMm / MM, integratedHandles: Boolean(run.options.integratedHandles), ...legOptions(unit, run) };
    const leaves = sceneLeaves(unit, entry.heightM);
    const openable = openablePartIds(run).filter((id) => id.startsWith(`${unit.id}:`));
    const grouped = runBoxesByModule(run, boxOptions(production)).modules.find((m) => m.unit.id === unit.id)!;
    /* Закрытая пара в пачке = ход в нуле. */
    const fronts = grouped.boxes.filter((box) => box.material === 'front');
    let closedDrift = 0;
    for (const leg of [0, 1] as const) {
      const pose = lPairPoses(unit, placeM, leg, 0, options).find((box) => box.role === 'front')!;
      const box = fronts.find((b) => b.part === `${unit.id}:door:${leg}`);
      closedDrift = Math.max(closedDrift, box ? Math.max(...[0, 1, 2].map((k) => Math.abs(box.position[k] - pose.center[k]) * MM)) : Infinity);
    }
    /* Г-полки: на каждой отметке — полка ноги А и полка ноги Б, сходятся в углу без щели. */
    const shelfBoxes = grouped.boxes.filter((box) => box.panel === SHELF_PANEL_NAME);
    const shelves = unit.fill?.shelves ?? [];
    let shelfGap = 0;
    for (const mm of shelves) {
      /* Отметка полки — от низа корпуса (`fill.shelves`): в ряду это низ модуля плюс она. */
      const at = shelfBoxes.filter((box) => Math.abs(box.position[1] - (entry.y + mm / MM)) < 1e-6).map((box) => worldBox(object.engine.places[0], box.position, box.scale, 'полка'));
      if (at.length !== 2) shelfGap = Infinity;
      else shelfGap = Math.max(shelfGap, -depthOf({ min: [at[0].min[0], 0, at[0].min[2]], max: [at[0].max[0], 1, at[0].max[2]] }, { min: [at[1].min[0], 0, at[1].min[2]], max: [at[1].max[0], 1, at[1].max[2]] }));
    }
    check(
      'P0.13 видео: верхний Г-шкаф — две дверцы на своих ключах (door:0, door:1), закрытые в пачке = ход в нуле, Г-полки на каждой отметке сходятся в углу; карусели нет',
      leaves.length === 2 &&
        leaves.every((leaf) => leaf.kind === 'lpair') &&
        openable.length === 2 &&
        closedDrift < 0.01 &&
        shelves.length > 0 &&
        shelfBoxes.length === 2 * shelves.length &&
        shelfGap <= 0.5 &&
        !grouped.boxes.some((box) => box.node === 'basket' || box.node === 'pullout'),
      `створок ${leaves.map((leaf) => leaf.id.slice(unit.id.length + 1)).join(', ')} · открываемых ${openable.length} · закрытые ${closedDrift.toFixed(3)} мм от хода · полок ${shelves.length} × 2 ноги = ${shelfBoxes.length} · щель полок в углу ${Math.max(0, shelfGap).toFixed(1)} мм`,
    );

    /* Порядок: один ход на обе — Б первой, А второй. */
    const stroke = lPairStroke(0.5);
    const stroke2 = lPairStroke(1.5);
    check(
      'P0.13 порядок дверец: ход пары 0…2 — до 1 едет дверца Б (первой), после — дверца А; А открыта — открыты обе',
      L_PAIR_FIRST_LEG === 1 && stroke.b === 0.5 && stroke.a === 0 && stroke2.b === 1 && stroke2.a === 0.5 && lPairTarget(true, false) === 2 && lPairTarget(false, true) === 1 && lPairTarget(false, false) === 0,
      `u 0,5 → Б ${stroke.b}, А ${stroke.a} · u 1,5 → Б ${stroke2.b}, А ${stroke2.a}`,
    );

    /* Ход по умолчанию (условная скоба, 90°): заходы внутри пары названы словами, цены нет. */
    const own = (object.engine.layout?.cornerClashes ?? []).filter((note) => note.own);
    const ownWords = own.map((note) => note.words).join(' | ');
    check(
      'P0.13 по умолчанию (условные скобы, петли до 90°): дверца Б заходит в ручку А у угла, дверца А — в открытую Б; оба захода названы словами с мм и с тем, что их снимает',
      own.length === 2 &&
        own.some((note) => note.words.includes('ручку дверцы') && note.words.includes('«Без ручки»')) &&
        own.some((note) => note.words.includes('открытую дверцу') && /не меньше \d+°/.test(note.words)),
      ownWords.slice(0, 400),
    );

    /* Как на видео: без ручки и с петлёй каталога 110° — внутри пары заходов нет, обе открыты — не касаются. */
    const hinge = hingeCatalog(110);
    const edited = runs.map((r, i) =>
      i !== 0
        ? r
        : {
            ...r,
            upperSegments: r.upperSegments.map((segment) => ({
              ...segment,
              modules: segment.modules.map((u) => (u.id === unit.id ? withFitting({ ...u, fill: { ...u.fill!, handle: 'none' as const } }, 'hinge', hinge.itemId) : u)),
            })),
          },
    );
    const kin = cornerKinematics({ runs: edited, places: object.engine.places, production: shop, hardware: hinge.catalog });
    const ownAfter = kin.clashes.filter((clash) => clash.own);
    const unitAfter = edited[0].upperSegments.flatMap((s) => s.modules).find((u) => u.id === unit.id)!;
    const angle = (leg: 0 | 1) => leafOpenAngle(unitAfter, `door:${leg}`, hinge.catalog, 'left').angle;
    const openA = lPairPoses(unitAfter, placeM, 0, 1, { ...options, hardware: hinge.catalog, openAngle: angle(0) });
    const openB = lPairPoses(unitAfter, placeM, 1, 1, { ...options, hardware: hinge.catalog, openAngle: angle(1) });
    const both = pairDepth(openA, openB);
    check(
      `P0.13 как на видео — «Без ручки» и петля каталога ${hinge.title}: внутри пары заходов 0, обе открыты — не касаются`,
      ownAfter.length === 0 && both <= 0,
      `своих заходов ${ownAfter.length} · обе открыты: зазор ${(-both).toFixed(1)} мм · углы ${Math.round((angle(0) * 180) / Math.PI)}° / ${Math.round((angle(1) * 180) / Math.PI)}°`,
    );

    /* Раскрой, смета, сцена, отпечаток: деталь та же, петли обычные, у дверцы Б свой фасад. */
    const withB = applyOps({
      run,
      requirements: wallRequirements(object, 0),
      ops: [{ op: 'set_leaf_front', moduleId: unit.id, leaf: 'door:1', front: { base: 'mdf_enamel', construct: 'solid', finish: 'gloss' } }],
      openings: [],
      roomDepthMm: 0,
    });
    const facades = buildPanels({ run: withB, production }).filter((panel) => panel.moduleId === unit.id && panel.name.startsWith(FACADE_PANEL_NAME));
    const facadeB = facades.find((panel) => panel.name === legName(FACADE_PANEL_NAME, 'Б'));
    const facadeA = facades.find((panel) => panel.name === legName(FACADE_PANEL_NAME, 'А'));
    const bifoldRun = rowsOf(bifold)[0];
    const bifoldUnit = uppers(bifoldRun).find((u) => u.kind === 'corner_upper')!;
    const sizes = (r: Run, id: string) =>
      buildPanels({ run: r, production })
        .filter((panel) => panel.moduleId === id && panel.name.startsWith(FACADE_PANEL_NAME))
        .map((panel) => `${panel.lengthMm}x${panel.widthMm}`)
        .sort()
        .join(',');
    const est = (r: Run) => {
      const lines = buildEstimate(r, 'optimal', DEMO_RATES, [], undefined, production).lines;
      const q = (pred: (key: string) => boolean) => lines.filter((line) => pred(line.key)).reduce((sum, line) => sum + line.quantity, 0);
      return { hinges: q((key) => key.startsWith('hinge_') && key !== 'hinge_corner_175'), corner: q((key) => key === 'hinge_corner_175') };
    };
    const pairEst = est(run);
    const bifoldEst = est(bifoldRun);
    const cups = grouped.boxes.filter((box) => box.node === 'hinge' && box.part?.startsWith(`${unit.id}:door:`)).length;
    check(
      'P0.13 раскрой, смета, сцена: фасады те же по размерам, у дверцы Б свой фасад (door:1); угловые петли 175° у верхнего Г-модуля уходят, обычных столько же больше; чашек в сцене = петель; отпечаток другой',
      sizes(run, unit.id) === sizes(bifoldRun, bifoldUnit.id) &&
        facadeB?.frontLeaf === 'door:1' &&
        facadeA?.frontLeaf !== 'door:1' &&
        pairEst.corner < bifoldEst.corner &&
        pairEst.hinges - bifoldEst.hinges === bifoldEst.corner - pairEst.corner &&
        cups === bifoldEst.corner - pairEst.corner &&
        object.engine.layout?.fingerprint !== bifold.engine.layout?.fingerprint,
      `фасады ${sizes(run, unit.id)} = ${sizes(bifoldRun, bifoldUnit.id)} · фасад Б ${facadeB?.frontLeaf ?? 'модуля'} · петли ${bifoldEst.hinges} → ${pairEst.hinges}, угловые ${bifoldEst.corner} → ${pairEst.corner} · чашек ${cups} · отпечаток ${bifold.engine.layout?.fingerprint} → ${object.engine.layout?.fingerprint}`,
    );

    /* Карточка дверец: заход назван ДО нажатия, по рядам экрана. */
    const bRuns = rowsOf(bifold);
    const cards = cornerDoorCards({
      runs: bRuns,
      index: 0,
      corners: bifold.engine.layout!.corners.map((corner) => corner.choice),
      requirements: bifold.requirements,
      wallOpenings: [[], []],
      labels: bRuns.map((_, i) => wallLabel(i)),
    });
    const pairCard = cards.find((card) => card.key === 'doors:pair');
    const current = cards.find((card) => card.current);
    check(
      'P0.13 карточка «две дверцы на своих петлях»: книжка стоит сейчас, у пары — цена по рядам с новым выбором и заход дверца в дверцу словами до нажатия',
      cards.length === 2 &&
        current?.key === 'doors:bifold' &&
        Boolean(pairCard?.runs) &&
        (pairCard?.changes ?? []).length === 2 &&
        (pairCard?.changes ?? []).every((line) => line.startsWith('после смены цены не будет:')),
      `${cards.map((card) => `${card.key}${card.current ? ' (сейчас)' : ''}`).join(', ')} · ${(pairCard?.changes ?? []).map((line) => line.slice(0, 90)).join(' | ')}`,
    );

    /* Смена владельца на правленой стене: потеря правок названа ДО нажатия. */
    const ownerCards = cornerOwnerCards({
      runs: rowsOf(gPrev),
      index: 0,
      corners: gPrev.engine.layout!.corners.map((corner) => corner.choice),
      requirements: gPrev.requirements,
      wallOpenings: [[], []],
      labels: rowsOf(gPrev).map((_, i) => wallLabel(i)),
      edited: (wall) => wall === 1,
      recompose: (choices) => {
        try {
          return { runs: rowsOf(buildObject({ ...G('пересборка', choices) })) };
        } catch (error) {
          return { why: (error as Error).message };
        }
      },
    });
    const flip = ownerCards.find((card) => card.key === 'owner:lower:next');
    const lines = flip?.changes ?? [];
    check(
      'P0.2 смена владельца низа: что изменится — словами до нажатия (««Дверца» 784 → 772 мм», длины рядов), правки правленой стены — «пропадут»',
      Boolean(flip) && !flip!.refusal && lines.some((line) => / → /.test(line)) && lines.some((line) => line.includes('правки этой стены пропадут')),
      lines.map((line) => line.slice(0, 110)).join(' | ') || (flip?.refusal ?? 'карточки нет'),
    );

    /*
     * Слова — только о том, что ИЗМЕНИТСЯ. Модуль, у которого сменилось одно
     * место, — «сдвинется от угла на N мм», а не «600 → 600 мм»: такая строка
     * ничего не говорит замерщику и занимает место настоящих правок (браузер:
     * «низ: «Мойка 600» 600 → 600 мм» на Г 3800 + 2400).
     */
    const noOp = lines.flatMap((line) =>
      Array.from(line.matchAll(/«([^»]+)» (\d+) → (\d+) мм/g))
        .filter((m) => m[2] === m[3])
        .map((m) => m[0]),
    );
    const [aRow] = rowsOf(gPrev);
    const target = lower(aRow)[1] ?? lower(aRow)[0];
    const shifted: Run = { ...aRow, modules: aRow.modules.map((unit) => (unit.id === target.id ? { ...unit, offsetMm: unit.offsetMm - 40 } : unit)) };
    const single = describeRebuild([aRow], [shifted], [0], [wallLabel(0)], undefined, 0);
    check(
      'P0.2 слова смены владельца — только изменения: «N → N мм» нет; модуль, сменивший одно место, назван сдвигом к углу или от угла с мм',
      Boolean(flip) && noOp.length === 0 && single.length === 1 && single[0].includes(`«${target.label}» сдвинется от угла на 40 мм`),
      `${noOp.join(' | ') || 'пустых правок нет'} · ${single.join(' | ') || 'слов нет'}`,
    );
  }
}

/** Наибольший заход между коробками двух дверец (полотна и ручки), мм; меньше нуля — зазор. Поворот — только вокруг вертикали. */
function pairDepth(a: PosedBox[], b: PosedBox[]): number {
  const rect = (box: PosedBox) => ({
    c: [box.center[0], box.center[2]] as [number, number],
    e: [box.size[0] / 2, box.size[2] / 2] as [number, number],
    u: [
      [Math.cos(box.yaw), -Math.sin(box.yaw)],
      [Math.sin(box.yaw), Math.cos(box.yaw)],
    ] as [number, number][],
    y: [box.center[1] - box.size[1] / 2, box.center[1] + box.size[1] / 2] as [number, number],
  });
  let worst = -Infinity;
  for (const p of a.filter((box) => box.role !== 'hinge')) {
    for (const q of b.filter((box) => box.role !== 'hinge')) {
      const A = rect(p);
      const B = rect(q);
      const yOver = Math.min(A.y[1], B.y[1]) - Math.max(A.y[0], B.y[0]);
      const d = [B.c[0] - A.c[0], B.c[1] - A.c[1]];
      let least = yOver;
      for (const n of [...A.u, ...B.u]) {
        const r = (R: typeof A) => R.e[0] * Math.abs(R.u[0][0] * n[0] + R.u[0][1] * n[1]) + R.e[1] * Math.abs(R.u[1][0] * n[0] + R.u[1][1] * n[1]);
        least = Math.min(least, r(A) + r(B) - Math.abs(d[0] * n[0] + d[1] * n[1]));
      }
      worst = Math.max(worst, least * MM);
    }
  }
  return worst;
}

const direct = process.argv[1] && /verify-p0-corners\.ts$/.test(process.argv[1]);
if (direct) {
  let passed = 0;
  let failed = 0;
  p0CornerChecks((name, condition, detail) => {
    if (condition) passed += 1;
    else failed += 1;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
