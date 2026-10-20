/**
 * ПРИЁМКА КАРТЫ РАСКРОЯ (CUT-01).
 *
 * Входит в `npm run test:millwork` (её зовёт `verify-millwork.ts`); отдельно —
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-cutting.ts`, этим
 * путём делается доказательство откатом.
 *
 * Путь экрана Studio: ряд → стены раскроя (`panelWallsOf`) → детали объекта
 * (`objectPanels`, та же функция, что у таблицы деталировки) → карта
 * (`cuttingPlan`) → PDF (`cuttingPdfPages` → `pdfFromJpegPages`) и CSV
 * (`cuttingCsv`). Материалы кладутся тем же `materialOps`, что панель
 * «Материалы», позиции — из файла каталога тем же импортом.
 *
 * Меряется НЕЗАВИСИМО от проверки внутри модуля: пересечения и поле листа,
 * пропил между соседями, замощение рабочего поля (детали + пропилы +
 * остатки = поле, и ни одна пара не пересекается), гильотина — переигрыванием
 * резов по порядку, текстура, толщина, лист своей группы, счёт деталей до
 * штуки и сверка деталировка = карта = PDF = CSV.
 */

import catalogJson from '../data/catalog/catalog.json';
import { applyOps } from '../lib/millwork/ops';
import { DEFAULT_REQUIREMENTS, composeVariants, workspaceInput } from '../lib/millwork/workspace';
import {
  compositionFor,
  objectInput,
  objectSite,
  panelWallsOf,
  savedWallRuns,
  wallCornerOf,
  wallRequirementsOf,
  wallSegments,
} from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { allModules } from '../lib/millwork/layout';
import { hasFacade } from '../lib/millwork/applianceFront';
import {
  DIVIDER_PANEL_NAME,
  DRAWER_FRONT_PANEL_NAME,
  SHELF_PANEL_NAME,
  objectPanels,
  panelTotals,
  type ObjectPanel,
} from '../lib/millwork/panels';
import {
  CUTTING_CSV_HEADER,
  cuttingCsv,
  cuttingErrors,
  cuttingPlan,
  decorCatalog,
  stockKey,
  type CuttingPlan,
  type CutSheet,
  type DecorInfo,
} from '../lib/millwork/cutting';
import { cuttingPdfPages, esc } from '../lib/millwork/cuttingDraw';
import { pdfFromJpegPages, pdfStructure } from '../lib/millwork/pdf';
import { carcassCatalog } from '../lib/millwork/carcassMaterial';
import {
  catalogEntriesFromRows,
  materialCatalog,
  materialOps,
  parseMaterialFile,
  planMaterialImport,
} from '../lib/millwork/materialCatalog';
import { MATERIAL_FINISHES } from '../lib/millwork/materialFinishes';
import { withReferences } from '../lib/millwork/referenceTextures';
import { REFERENCE_TEXTURES } from '../lib/millwork/referenceTextures.generated';
import { runBoxes } from '../lib/millwork/cabinetBoxes';
import {
  DEFAULT_PRODUCTION,
  TYPICAL_CUTTING,
  cuttingSettings,
  productionSettings,
  type CuttingSettings,
  type ProductionSettings,
} from '../types/catalog';
import type { Composition, FrontSpec, Measurement, MillworkOp, Run, RunRequirements, VariantKey } from '../types/millwork';
import type { CarcassItem } from '../lib/millwork/carcassMaterial';
import type { MillingItem } from '../lib/millwork/milling';

type Check = (name: string, condition: boolean, detail?: string) => void;

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;

/** Листы цеха для приёмки: выбраны человеком и подтверждены — как после «Сохранить для цеха». */
const SHEETS: CuttingSettings['sheets'] = [
  { stock: 'ldsp:16', lengthMm: 2800, widthMm: 2070 },
  { stock: 'ldsp:18', lengthMm: 2800, widthMm: 2070 },
  { stock: 'mdf:16', lengthMm: 2800, widthMm: 2070 },
  { stock: 'mdf:18', lengthMm: 2800, widthMm: 2070 },
  { stock: 'mdf:19', lengthMm: 2800, widthMm: 2070 },
  { stock: 'hdf:3', lengthMm: 2800, widthMm: 2070 },
  { stock: 'hdf:4', lengthMm: 2800, widthMm: 2070 },
];
const CONFIRMED: CuttingSettings = { ...TYPICAL_CUTTING, sheets: SHEETS, confirmed: true };

type Screen = {
  layout: Composition | null;
  segments: Run[];
  input: { runWallId: string; milling?: Map<string, MillingItem>; carcass?: Map<string, CarcassItem> };
  production: ProductionSettings;
  fingerprint: string;
};

/* ─────────────────────────  Объекты путём экрана  ───────────────────────── */

/** Кухня демо: одна стена, правки — тем же `applyOps`, что у кнопок. */
function kitchenScreen(
  opts: {
    production?: ProductionSettings;
    carcass?: Map<string, CarcassItem>;
    ops?: (run: Run) => MillworkOp[];
  } = {},
): Screen & { warnings: string[] } {
  const production = opts.production ?? DEFAULT_PRODUCTION;
  const requirements = DEMO_REQUIREMENTS;
  const base = workspaceInput({ title: 'CUT-01', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({
    base,
    resolution: null,
    requirements,
    rates: DEMO_RATES,
    production,
    milling: new Map(),
    carcass: opts.carcass ?? new Map(),
    materials: new Map(),
    corner: undefined,
  });
  let active = composeVariants(input, DISABLED, {}).find((variant) => variant.key === 'optimal')!;
  let warnings: string[] = [];
  if (opts.ops) {
    const next = applyOps({ run: active.run, requirements, ops: opts.ops(active.run), openings: input.openings });
    warnings = next.warnings;
    active = composeVariants(input, DISABLED, { optimal: next }).find((variant) => variant.key === 'optimal')!;
  }
  return {
    layout: null,
    segments: wallSegments(null, active.run, {}),
    input,
    production,
    fingerprint: active.run.fingerprint,
    warnings,
  };
}

/** Шкаф 1000 × 2400 × 600 путём экрана (как R01): спальня, потолок 2500, свободная сборка, один модуль. */
function wardrobeScreen(
  opts: { production?: ProductionSettings; ops?: (run: Run, cabinetId: string) => MillworkOp[] } = {},
): Screen & { cabinetId: string; warnings: string[] } {
  const production = opts.production ?? DEFAULT_PRODUCTION;
  const measurement: Measurement = {
    id: 'cut-01',
    ceilingHeightMm: 2500,
    walls: [{ id: 'w1', lengthMm: 3000, angleDeg: 90, openings: [] }],
    comms: [],
    photos: [],
    measuredBy: 'CUT-01',
    measuredAt: '2026-10-20',
    notes: '',
  };
  const requirements = { ...DEMO_REQUIREMENTS, zone: 'bedroom', mode: 'free', appliances: [], sections: [] } as RunRequirements;
  const input = workspaceInput({
    title: 'CUT-01',
    zone: 'Спальня',
    measurement,
    requirements,
    rates: DEMO_RATES,
    wallId: 'w1',
    cornerAt: null,
    production,
  });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings, roomDepthMm: 0 });
    edited = { ...edited, optimal: next };
    return next;
  };
  const start = shown().run;
  const cabinet = start.modules.find((unit) => unit.section === 'shelves');
  if (!cabinet) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: CUT-01 — в ряду спальни нет шкафа «Полки»');
  /* Один шкаф — соседи справа и слева сняты тем же «Удалить». */
  ops(start.modules.filter((unit) => unit.id !== cabinet.id).map((unit) => ({ op: 'remove_module' as const, moduleId: unit.id })));
  ops([{ op: 'set_width', moduleId: cabinet.id, widthMm: 1000 }]);
  let warnings: string[] = [];
  if (opts.ops) warnings = ops(opts.ops(shown().run, cabinet.id)).warnings;
  const run = shown().run;
  return { layout: null, segments: wallSegments(null, run, {}), input, production, fingerprint: run.fingerprint, cabinetId: cabinet.id, warnings };
}

/**
 * Распашной шкаф 900 + 1000 × 2500 по две створки — тот же ряд, что у
 * приёмки МДФ-фасадов (`mdf-look-fixture.ts`): спальня, потолок 2600.
 */
function hingedWardrobeScreen(): Screen {
  const measurement: Measurement = {
    id: 'cut-01-hinged',
    ceilingHeightMm: 2600,
    walls: [{ id: 'w1', lengthMm: 3000, angleDeg: 90, openings: [] }],
    comms: [],
    photos: [],
    measuredBy: 'CUT-01',
    measuredAt: '2026-10-20',
    notes: '',
  };
  const requirements = { ...DEFAULT_REQUIREMENTS, zone: 'bedroom', mode: 'free', doorSystem: 'hinged', appliances: [], sections: [] } as RunRequirements;
  const input = workspaceInput({ title: 'CUT-01', zone: 'Спальня', measurement, requirements, rates: DEMO_RATES, wallId: 'w1', cornerAt: null, production: DEFAULT_PRODUCTION });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!.run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements, ops: list, openings: input.openings, roomDepthMm: 0 });
    if (next.warnings.length) throw new Error(`движок отказал: ${next.warnings.join(' | ')}`);
    edited = { optimal: next };
  };
  const keep = new Set(['tall-0@w1', 'tall-900@w1']);
  if (!shown().modules.some((unit) => unit.id === 'tall-900@w1')) {
    throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: в ряду нет tall-900@w1 — ${shown().modules.map((unit) => unit.id).join(', ')}`);
  }
  ops(shown().modules.filter((unit) => !keep.has(unit.id)).map((unit) => ({ op: 'remove_module' as const, moduleId: unit.id })));
  ops([{ op: 'set_width', moduleId: 'tall-900@w1', widthMm: 1000 }]);
  const run = shown();
  if (run.modules.length !== 2 || run.modules.some((unit) => unit.frontType !== 'door' || unit.doorCount !== 2)) {
    throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шкаф не тот — ${run.modules.map((unit) => `${unit.id}:${unit.widthMm}:${unit.doorCount}`).join(' · ')}`);
  }
  return { layout: null, segments: wallSegments(null, run, {}), input, production: DEFAULT_PRODUCTION, fingerprint: run.fingerprint };
}

/** Угловая кухня a + b путём экрана: `objectSite` → `compositionFor` → `objectInput` → `composeVariants` → `wallSegments`. */
function cornerScreen(): Screen {
  const room: Measurement = {
    id: 'cut-01-l',
    ceilingHeightMm: 2700,
    walls: (
      [
        ['a', 3600],
        ['b', 3000],
        ['c', 3600],
        ['d', 3000],
      ] as [string, number][]
    ).map(([id, lengthMm]) => ({ id, lengthMm, angleDeg: 90, openings: [] })),
    comms: [],
    photos: [],
    measuredBy: 'CUT-01',
    measuredAt: '2026-10-20',
    notes: '',
  };
  const requirements = DEMO_REQUIREMENTS;
  const base = workspaceInput({ title: 'CUT-01', zone: 'Кухня', measurement: room, requirements, rates: DEMO_RATES, wallId: 'a', cornerAt: null });
  const site = objectSite(base, null);
  const attempt = compositionFor({
    shape: 'corner_l',
    requirements,
    cornerSolution: 'false_panel',
    corners: undefined,
    site,
    production: DEFAULT_PRODUCTION,
    variantKey: 'optimal',
  });
  if (attempt?.state !== 'built') {
    throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: угловая кухня a + b не собралась — ${attempt?.state === 'refused' ? attempt.reason : 'композиции нет'}`);
  }
  const layout = attempt.composition;
  const input = objectInput({
    base,
    resolution: null,
    requirements: wallRequirementsOf(layout, requirements),
    rates: DEMO_RATES,
    production: DEFAULT_PRODUCTION,
    milling: new Map(),
    carcass: new Map(),
    materials: new Map(),
    corner: wallCornerOf(layout),
  });
  const active = composeVariants(input, DISABLED, {}).find((variant) => variant.key === 'optimal')!;
  return {
    layout,
    segments: wallSegments(layout, active.run, savedWallRuns({})),
    input,
    production: DEFAULT_PRODUCTION,
    fingerprint: layout.fingerprint,
  };
}

/** Карта путём экрана: те же стены и детали, что у таблицы деталировки. */
function cutOf(screen: Screen, settings: CuttingSettings, decors: Map<string, DecorInfo> = new Map(), exportLock: string | null = null) {
  const walls = panelWallsOf(screen.layout, screen.segments, screen.input.runWallId);
  const parts = objectPanels({ walls, production: screen.production, milling: screen.input.milling, carcass: screen.input.carcass });
  const plan = cuttingPlan({ parts, settings, decors, exportLock, fingerprint: screen.fingerprint });
  return { walls, parts, plan };
}

/* ─────────────────────────  Независимая проверка карты  ───────────────────────── */

type Rect = { x0: number; y0: number; x1: number; y1: number };
const EPS = 1e-6;
const rectOf = (x: number, y: number, w: number, h: number): Rect => ({ x0: x, y0: y, x1: x + w, y1: y + h });
const areaOf = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
const overlaps = (a: Rect, b: Rect) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > EPS;
const sameRect = (a: Rect, b: Rect) =>
  Math.abs(a.x0 - b.x0) < EPS && Math.abs(a.y0 - b.y0) < EPS && Math.abs(a.x1 - b.x1) < EPS && Math.abs(a.y1 - b.y1) < EPS;

/** Геометрия одного листа — без единого вызова модуля раскроя. */
function auditSheet(sheet: CutSheet, grain: boolean, settings: CuttingSettings): string[] {
  const problems: string[] = [];
  const label = `лист ${sheet.number}`;
  const work = rectOf(sheet.trimMm, sheet.trimMm, sheet.lengthMm - 2 * sheet.trimMm, sheet.widthMm - 2 * sheet.trimMm);
  const parts = sheet.placements.map((p) => ({ p, r: rectOf(p.xMm, p.yMm, p.wMm, p.hMm) }));
  const kerfs = sheet.cuts.map((c) =>
    c.direction === 'across' ? rectOf(c.atMm, c.fromMm, c.kerfMm, c.toMm - c.fromMm) : rectOf(c.fromMm, c.atMm, c.toMm - c.fromMm, c.kerfMm),
  );
  const free = [...sheet.remnants, ...sheet.scraps].map((r) => rectOf(r.xMm, r.yMm, r.wMm, r.hMm));
  const all = [...parts.map((x) => x.r), ...kerfs, ...free];

  for (const r of all) {
    const values = [r.x0, r.y0, r.x1, r.y1];
    if (!values.every(Number.isFinite) || !(r.x1 - r.x0 > 0 && r.y1 - r.y0 > 0)) problems.push(`${label}: прямоугольник без площади или не число`);
    if (r.x0 < work.x0 - EPS || r.y0 < work.y0 - EPS || r.x1 > work.x1 + EPS || r.y1 > work.y1 + EPS) {
      problems.push(`${label}: прямоугольник ${r.x0}…${r.x1} × ${r.y0}…${r.y1} за рабочим полем`);
    }
  }
  let crossings = 0;
  for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) if (overlaps(all[i], all[j])) crossings += 1;
  if (crossings > 0) problems.push(`${label}: пересечений ${crossings}`);
  const covered = all.reduce((sum, r) => sum + areaOf(r), 0);
  if (Math.abs(covered - areaOf(work)) > 0.01) problems.push(`${label}: покрыто ${covered} мм² при рабочем поле ${areaOf(work)} мм²`);

  /* Пропил между соседями по одной полосе: впритык детали не пилятся. */
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const a = parts[i].r;
      const b = parts[j].r;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if ((oy > EPS && ox <= EPS && -ox < sheet.kerfMm - EPS) || (ox > EPS && oy <= EPS && -oy < sheet.kerfMm - EPS)) {
        problems.push(`${label}: ${parts[i].p.piece.id} и ${parts[j].p.piece.id} ближе пропила ${sheet.kerfMm} мм`);
      }
    }
  }

  for (const { p } of parts) {
    const part = p.piece.part;
    const [w, h] = p.rotation === 0 ? [part.lengthMm, part.widthMm] : [part.widthMm, part.lengthMm];
    if (Math.abs(p.wMm - w) > EPS || Math.abs(p.hMm - h) > EPS) problems.push(`${label}: ${p.piece.id} на листе ${p.wMm} × ${p.hMm}, в деталировке ${part.lengthMm} × ${part.widthMm}`);
    if (grain && part.grain === 'along' && p.rotation !== 0) problems.push(`${label}: ${p.piece.id} «вдоль» повёрнута на ${p.rotation}°`);
    if (grain && part.grain === 'across' && p.rotation !== 90) problems.push(`${label}: ${p.piece.id} «поперёк» лежит на ${p.rotation}°`);
    if (!settings.rotate && !(grain && part.grain !== 'none') && p.rotation !== 0) problems.push(`${label}: ${p.piece.id} повёрнута при запрете поворота`);
    if (part.thicknessMm !== sheet.thicknessMm) problems.push(`${label}: ${p.piece.id} толщиной ${part.thicknessMm} на листе ${sheet.thicknessMm}`);
    if (stockKey(part.stock, part.thicknessMm) !== sheet.groupKey) problems.push(`${label}: ${p.piece.id} с листа ${stockKey(part.stock, part.thicknessMm)}`);
  }

  /* Гильотина: каждый рез по порядку проходит через весь кусок от края до края. */
  let pieces: Rect[] = [work];
  for (const c of sheet.cuts) {
    const at = pieces.findIndex((r) =>
      c.direction === 'across'
        ? Math.abs(r.y0 - c.fromMm) < EPS && Math.abs(r.y1 - c.toMm) < EPS && c.atMm > r.x0 + EPS && c.atMm + c.kerfMm <= r.x1 + EPS
        : Math.abs(r.x0 - c.fromMm) < EPS && Math.abs(r.x1 - c.toMm) < EPS && c.atMm > r.y0 + EPS && c.atMm + c.kerfMm <= r.y1 + EPS,
    );
    if (at < 0) {
      problems.push(`${label}: рез ${c.n} не проходит через весь кусок — схема не гильотинная`);
      pieces = [];
      break;
    }
    const r = pieces.splice(at, 1)[0];
    if (c.direction === 'across') {
      pieces.push({ ...r, x1: c.atMm });
      if (c.atMm + c.kerfMm < r.x1 - EPS) pieces.push({ ...r, x0: c.atMm + c.kerfMm });
    } else {
      pieces.push({ ...r, y1: c.atMm });
      if (c.atMm + c.kerfMm < r.y1 - EPS) pieces.push({ ...r, y0: c.atMm + c.kerfMm });
    }
  }
  const leaves = [...parts.map((x) => x.r), ...free];
  if (pieces.length > 0 && (pieces.length !== leaves.length || !leaves.every((leaf) => pieces.some((piece) => sameRect(piece, leaf))))) {
    problems.push(`${label}: после ${sheet.cuts.length} резов кусков ${pieces.length} при деталях и остатках ${leaves.length}`);
  }
  return problems;
}

/** Карта целиком против деталировки: счёт до штуки и каждый лист. */
function auditPlan(parts: ObjectPanel[], plan: CuttingPlan): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const part of parts) for (let i = 1; i <= part.qty; i += 1) seen.set(`${part.partId}#${i}`, 0);
  const bump = (id: string, where: string) => {
    if (!seen.has(id)) problems.push(`${where}: ${id} — не деталь деталировки`);
    else seen.set(id, seen.get(id)! + 1);
  };
  for (const sheet of plan.sheets) for (const p of sheet.placements) bump(`${p.piece.part.partId}#${p.piece.instance}`, `лист ${sheet.number}`);
  for (const group of plan.groups) {
    for (const u of group.unplaced) bump(`${u.piece.part.partId}#${u.piece.instance}`, 'неразложенные');
    if (!group.format) {
      for (const piece of group.pieces) if (!group.unplaced.some((u) => u.piece === piece)) bump(`${piece.part.partId}#${piece.instance}`, `без листа ${group.key}`);
    }
  }
  for (const [id, n] of Array.from(seen.entries())) if (n !== 1) problems.push(`${id}: ${n === 0 ? 'потеряна' : `${n} раза`}`);
  if (plan.pieces !== seen.size) problems.push(`деталей в карте ${plan.pieces} при ${seen.size} в деталировке`);
  for (const sheet of plan.sheets) {
    const group = plan.groups.find((g) => g.key === sheet.groupKey);
    if (!group) {
      problems.push(`лист ${sheet.number}: группы нет`);
      continue;
    }
    problems.push(...auditSheet(sheet, group.grain, plan.settings));
  }
  return problems;
}

/** Строка CSV с кавычками. */
function csvCells(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      out.push(cell);
      cell = '';
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

/** Деталировка → карта → PDF → CSV: одни детали, одни листы, одни места. */
function auditExports(parts: ObjectPanel[], plan: CuttingPlan): string[] {
  const problems: string[] = [];
  const placements = plan.sheets.flatMap((sheet) => sheet.placements.map((p) => ({ p, sheet })));

  const lines = cuttingCsv(plan).split('\r\n').filter(Boolean);
  if (lines[0] !== CUTTING_CSV_HEADER.join(';')) problems.push(`CSV: заголовок «${lines[0]}»`);
  const rows = lines.slice(1).map(csvCells);
  if (rows.length !== placements.length) problems.push(`CSV: строк ${rows.length} при ${placements.length} деталях на листах`);
  const col = (name: string) => CUTTING_CSV_HEADER.indexOf(name as (typeof CUTTING_CSV_HEADER)[number]);
  rows.forEach((cells, i) => {
    const item = placements[i];
    if (!item) return;
    const { p, sheet } = item;
    const want: [string, string | number][] = [
      ['PartID', p.piece.id],
      ['ModuleID', p.piece.part.moduleId],
      ['LengthMm', p.piece.lengthMm],
      ['WidthMm', p.piece.widthMm],
      ['Quantity', 1],
      ['ThicknessMm', p.piece.part.thicknessMm],
      ['SheetNumber', sheet.number],
      ['PositionX', p.xMm],
      ['PositionY', p.yMm],
      ['RotationDeg', p.rotation],
    ];
    const off = want.filter(([name, value]) => cells[col(name)] !== String(value));
    if (off.length > 0) problems.push(`CSV строка ${i + 1}: ${off.map(([name]) => name).join(', ')} не та, что у ${p.piece.id}`);
  });
  if (new Set(rows.map((cells) => cells[col('PartID')])).size !== rows.length) problems.push('CSV: номера деталей повторяются');

  const pages = cuttingPdfPages(plan, { title: 'CUT-01', date: '2026-10-20', fingerprint: plan.fingerprint, draft: !plan.release.ok });
  const waiting = plan.groups.reduce((sum, g) => sum + (g.format ? g.unplaced.length : g.pieces.length), 0);
  const tablePages = Math.ceil((placements.length + waiting) / 44);
  if (pages.length !== 1 + plan.sheets.length + tablePages) {
    problems.push(`PDF: страниц ${pages.length} при сводке, ${plan.sheets.length} листах и ${tablePages} страницах таблицы`);
  }
  plan.sheets.forEach((sheet, i) => {
    const page = pages[1 + i] ?? '';
    const drawn = (page.match(/data-cut-piece="/g) ?? []).length;
    if (drawn !== sheet.placements.length) problems.push(`PDF лист ${sheet.number}: нарисовано ${drawn} при ${sheet.placements.length}`);
    if (!page.includes(`Лист ${sheet.number} из ${plan.sheets.length}`)) problems.push(`PDF: страница листа ${sheet.number} без номера`);
  });
  const table = pages.slice(1 + plan.sheets.length).join('');
  const missing = placements.filter(({ p }) => !table.includes(`>${esc(p.piece.id)}<`));
  if (missing.length > 0) problems.push(`PDF: в таблице нет ${missing.length} деталей (${missing[0].p.piece.id}…)`);
  const pdf = pdfStructure(pdfFromJpegPages(pages.map(() => ({ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), widthPx: 10, heightPx: 7 })), { title: 'CUT-01', date: '2026-10-20' }));
  if (!pdf.ok || pdf.pages !== pages.length || pdf.images !== pages.length) problems.push(`PDF-файл: ${pdf.problems.join('; ') || `страниц ${pdf.pages}, картинок ${pdf.images}`}`);

  /* Кромка карты — та же, что итоги деталировки. */
  const totals = panelTotals(parts);
  const edge = plan.edges.reduce((sum, e) => sum + e.meters, 0);
  if (Math.abs(edge - (totals.edgeThickM + totals.edgeThinM)) > 0.011) problems.push(`кромка карты ${edge} м при ${totals.edgeThickM + totals.edgeThinM} м в деталировке`);
  return problems;
}

const short = (list: string[]) => (list.length === 0 ? '' : `${list.length}: ${list.slice(0, 3).join(' | ')}`);
const statsOf = (plan: CuttingPlan) =>
  plan.groups
    .map((g) => `${g.title}: ${g.sheets.length} л. (${(g.utilization * 100).toFixed(1)} %), деталей ${g.pieces.length}${g.unplaced.length ? `, не разложено ${g.unplaced.length}` : ''}`)
    .join(' | ');

/* ─────────────────────────  Сценарии  ───────────────────────── */

export function cuttingChecks(check: Check): void {
  console.log('\nCUT-01: карта раскроя — детали деталировки на листах цеха');

  /* Каталог EGGER — тем же импортом, что админка; материалы — тем же `materialOps`, что панель. */
  const file = parseMaterialFile(catalogJson);
  const importPlan = planMaterialImport(file, [], { collections: ['egger-ldsp'] });
  const entries = withReferences(catalogEntriesFromRows(importPlan.rows, file, 'org-cut', 'cut:'), REFERENCE_TEXTURES);
  const items = materialCatalog(entries);
  const carcass = carcassCatalog(entries);
  const decors = decorCatalog(entries);
  const ldsp = file.collections.find((c) => c.id === 'egger-ldsp')!;
  const pick = (code: string) => {
    const item = Array.from(items.values()).find((i) => i.code === code);
    if (!item) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${code} в каталоге нет`);
    return { item, collection: ldsp, surface: ldsp.finishes[0] };
  };
  const H1113 = pick('EGGER-H1113-ST10');
  const H1180 = pick('EGGER-H1180-ST37');
  const W1000 = pick('EGGER-W1000-ST9');
  const opsOf = (run: Run, target: 'fronts' | 'carcass', choice: ReturnType<typeof pick>) => {
    const made = materialOps(target, choice, run, null, MATERIAL_FINISHES);
    if ('refusal' in made) throw new Error(`материал не лёг (${target}): ${made.refusal}`);
    return made.ops;
  };

  /* ── A. Прямой шкаф 1000 × 2400 × 600 ── */
  const wardrobe = wardrobeScreen();
  const a = cutOf(wardrobe, CONFIRMED);
  const aAudit = [...auditPlan(a.parts, a.plan), ...auditExports(a.parts, a.plan)];
  const side = a.parts.find((p) => p.name === 'Боковина' && p.moduleId === wardrobe.cabinetId);
  const cabinet = allModules(wardrobe.segments[0]).find((unit) => unit.id === wardrobe.cabinetId);
  check(
    'CUT.A шкаф 1000 × 2400 × 600: все детали деталировки на листах ЛДСП 16 и ХДФ 3, пересечений 0, пропил между соседями, гильотина, текстура; CSV и PDF — те же детали и места; выпуск открыт',
    aAudit.length === 0 &&
      a.plan.errors.length === 0 &&
      a.plan.release.ok &&
      cabinet?.widthMm === 1000 &&
      side?.lengthMm === 2400 &&
      side?.widthMm === 600 &&
      a.plan.placed === a.plan.pieces &&
      a.plan.groups.map((g) => g.key).join(',') === 'ldsp:16:-,hdf:3:-',
    aAudit.length
      ? short(aAudit)
      : `${statsOf(a.plan)} · боковина ${side?.lengthMm} × ${side?.widthMm} · деталей ${a.plan.placed}/${a.plan.pieces} · ошибок ${a.plan.errors.length}`,
  );

  /* ── B. Полки и перегородки (отсеки R01) ── */
  const bays = wardrobeScreen({
    ops: (run, id) => {
      const unit = run.modules.find((m) => m.id === id)!;
      return [
        {
          op: 'set_fill',
          moduleId: id,
          fill: {
            ...unit.fill!,
            shelves: [],
            dividerMm: 0,
            rodsMm: [],
            drawerHeights: [],
            bays: [
              { id: 'b1', widthMm: 476, shelves: { mode: 'even', count: 4 } },
              { id: 'b2', shelves: { mode: 'even', count: 2 } },
            ],
          } as never,
        },
      ];
    },
  });
  const b = cutOf(bays, CONFIRMED);
  const bAudit = [...auditPlan(b.parts, b.plan), ...auditExports(b.parts, b.plan)];
  const bShelves = b.parts.filter((p) => p.name === SHELF_PANEL_NAME).reduce((s, p) => s + p.qty, 0);
  const bDividers = b.parts.filter((p) => p.name === DIVIDER_PANEL_NAME).reduce((s, p) => s + p.qty, 0);
  const placedNames = (plan: CuttingPlan, name: string) =>
    plan.sheets.reduce((sum, sheet) => sum + sheet.placements.filter((p) => p.piece.part.name === name).length, 0);
  check(
    'CUT.B полки и перегородка отсеков: 6 полок и 1 перегородка деталировки — на листах столько же, каждая своим размером; карта сходится',
    bAudit.length === 0 && b.plan.errors.length === 0 && bShelves === 6 && bDividers === 1 && placedNames(b.plan, SHELF_PANEL_NAME) === 6 && placedNames(b.plan, DIVIDER_PANEL_NAME) === 1,
    bAudit.length ? short(bAudit) : `полок ${bShelves} → на листах ${placedNames(b.plan, SHELF_PANEL_NAME)} · перегородок ${bDividers} → ${placedNames(b.plan, DIVIDER_PANEL_NAME)} · ${statsOf(b.plan)}${bays.warnings.length ? ` · правка: ${bays.warnings.join(' | ')}` : ''}`,
  );

  /* ── C. Антресоль: отдельный корпус над шкафом ── */
  /*
   * Шкаф опускается до 2000 под антресоль 400. Полку на 2112 продукт молча
   * не снимает (отказ «поправьте наполнение»), поэтому сначала её снимает
   * человек — тем же `set_fill`, потом ставит антресоль.
   */
  const mezz = wardrobeScreen({
    ops: (run, id) => {
      const unit = run.modules.find((m) => m.id === id)!;
      return [
        { op: 'set_fill', moduleId: id, fill: { ...unit.fill!, shelves: unit.fill!.shelves.filter((at) => at < 1900) } },
        { op: 'add_overhead', moduleId: id, heightMm: 400, baseHeightMm: 2000 } as MillworkOp,
      ];
    },
  });
  const c = cutOf(mezz, CONFIRMED);
  const cAudit = [...auditPlan(c.parts, c.plan), ...auditExports(c.parts, c.plan)];
  const overheadIds = new Set(allModules(mezz.segments[0]).filter((unit) => unit.overhead).map((unit) => unit.id));
  const overheadParts = c.parts.filter((p) => overheadIds.has(p.moduleId)).reduce((s, p) => s + p.qty, 0);
  const overheadPlaced = c.plan.sheets.reduce((s, sheet) => s + sheet.placements.filter((p) => overheadIds.has(p.piece.part.moduleId)).length, 0);
  check(
    'CUT.C антресоль над шкафом: её детали (боковины, дно, крыша, задняя стенка) — на листах, как в деталировке; карта сходится',
    cAudit.length === 0 && c.plan.errors.length === 0 && overheadIds.size === 1 && overheadParts > 0 && overheadPlaced === overheadParts,
    cAudit.length ? short(cAudit) : `антресолей ${overheadIds.size} · её деталей ${overheadParts} → на листах ${overheadPlaced} · ${statsOf(c.plan)}${mezz.warnings.length ? ` · правка: ${mezz.warnings.join(' | ')}` : ''}`,
  );

  /* ── D. МДФ-фасады в эмали: лист — МДФ без покрытия ── */
  const ENAMEL: FrontSpec = { base: 'mdf_enamel', construct: 'solid', finish: 'matte' };
  const enamel = kitchenScreen({ ops: (run) => allModules(run).filter(hasFacade).map((unit) => ({ op: 'set_front' as const, moduleId: unit.id, front: ENAMEL })) });
  const d = cutOf(enamel, CONFIRMED);
  const dAudit = [...auditPlan(d.parts, d.plan), ...auditExports(d.parts, d.plan)];
  const raw = d.plan.groups.find((g) => g.key === 'mdf:16:raw');
  const frontsInRaw = raw ? raw.pieces.every((piece) => piece.part.material.startsWith('Фасад') || piece.part.name.startsWith(DRAWER_FRONT_PANEL_NAME)) : false;
  const frontsElsewhere = d.plan.groups.filter((g) => g.key !== 'mdf:16:raw').flatMap((g) => g.pieces).filter((piece) => piece.part.material.startsWith('Фасад')).length;
  check(
    'CUT.D фасады в эмали: все фасады — на листах «МДФ 16 без покрытия», на ЛДСП ни одного; кромки у них нет и в карте; карта сходится',
    dAudit.length === 0 &&
      d.plan.errors.length === 0 &&
      Boolean(raw && raw.pieces.length > 0) &&
      frontsInRaw &&
      frontsElsewhere === 0 &&
      Boolean(raw?.pieces.every((piece) => piece.part.edges.long + piece.part.edges.short === 0)),
    dAudit.length ? short(dAudit) : `${statsOf(d.plan)} · фасадов вне МДФ ${frontsElsewhere}`,
  );

  /* ── E. Угловая кухня: обе стены и фальш-панель угла ── */
  const corner = cornerScreen();
  const e = cutOf(corner, CONFIRMED);
  const eAudit = [...auditPlan(e.parts, e.plan), ...auditExports(e.parts, e.plan)];
  const eWalls = new Set(e.plan.sheets.flatMap((sheet) => sheet.placements.map((p) => p.piece.part.wallId)));
  const filler = e.plan.sheets.flatMap((sheet) => sheet.placements).filter((p) => p.piece.part.name.startsWith('Фальш-панель угла'));
  check(
    'CUT.E угловая кухня a + b: детали обеих стен — на листах, фальш-панель угла — на листе фасадов; номера с буквой стены; карта сходится',
    eAudit.length === 0 && e.plan.errors.length === 0 && eWalls.has('a') && eWalls.has('b') && filler.length > 0 && filler.every((p) => p.piece.part.stock.kind === 'ldsp'),
    eAudit.length ? short(eAudit) : `стены ${Array.from(eWalls).join(',')} · фальш-панелей ${filler.length} · ${statsOf(e.plan)}`,
  );

  /* ── F. Разные материалы: корпус H1113, фасады H1180 — разные листы ── */
  const mixed = kitchenScreen({
    carcass,
    ops: (run) => [...opsOf(run, 'carcass', H1113), ...opsOf(run, 'fronts', H1180)],
  });
  const f = cutOf(mixed, CONFIRMED, decors);
  const fAudit = [...auditPlan(f.parts, f.plan), ...auditExports(f.parts, f.plan)];
  const keyH1113 = `ldsp:16:item:${H1113.item.id}`;
  const keyH1180 = `ldsp:16:item:${H1180.item.id}`;
  const mixedSheets = f.plan.sheets.filter((sheet) => new Set(sheet.placements.map((p) => p.piece.part.stock.decor)).size > 1).length;
  const gH1113 = f.plan.groups.find((g) => g.key === keyH1113);
  const gH1180 = f.plan.groups.find((g) => g.key === keyH1180);
  check(
    'CUT.F корпус EGGER H1113 ST10 и фасады EGGER H1180 ST37: две группы листов, ни один лист не несёт оба декора; названия — артикулы каталога',
    fAudit.length === 0 &&
      f.plan.errors.length === 0 &&
      Boolean(gH1113 && gH1180 && gH1113.sheets.length > 0 && gH1180.sheets.length > 0) &&
      mixedSheets === 0 &&
      Boolean(gH1113?.title.includes('EGGER-H1113-ST10') && gH1180?.title.includes('EGGER-H1180-ST37')) &&
      mixed.warnings.length === 0,
    fAudit.length ? short(fAudit) : `${statsOf(f.plan)} · листов с двумя декорами ${mixedSheets}${mixed.warnings.length ? ` · правка: ${mixed.warnings.join(' | ')}` : ''}`,
  );

  /* ── G. Две толщины ЛДСП: корпус 16, фасады 18 ── */
  const thick: ProductionSettings = { ...DEFAULT_PRODUCTION, carcassMm: 16, frontMm: 18 };
  const two = kitchenScreen({ production: thick });
  const g = cutOf(two, CONFIRMED);
  const gAudit = [...auditPlan(g.parts, g.plan), ...auditExports(g.parts, g.plan)];
  const g16 = g.plan.groups.find((x) => x.key === 'ldsp:16:-');
  const g18 = g.plan.groups.find((x) => x.key === 'ldsp:18:-');
  check(
    'CUT.G ЛДСП 16 и 18: два листа разной толщины, на каждом детали только своей толщины',
    gAudit.length === 0 &&
      g.plan.errors.length === 0 &&
      Boolean(g16 && g18) &&
      g.plan.sheets.every((sheet) => sheet.placements.every((p) => p.piece.part.thicknessMm === sheet.thicknessMm)) &&
      Boolean(g16?.sheets.every((sheet) => sheet.thicknessMm === 16) && g18?.sheets.every((sheet) => sheet.thicknessMm === 18)),
    gAudit.length ? short(gAudit) : statsOf(g.plan),
  );

  /* ── H. Древесный декор: направление обязательно; однотонный — можно поворачивать ── */
  const wood = kitchenScreen({ carcass, ops: (run) => [...opsOf(run, 'carcass', H1113), ...opsOf(run, 'fronts', H1113)] });
  const uni = kitchenScreen({ carcass, ops: (run) => [...opsOf(run, 'carcass', W1000), ...opsOf(run, 'fronts', W1000)] });
  const hWood = cutOf(wood, CONFIRMED, decors);
  const hUni = cutOf(uni, CONFIRMED, decors);
  const woodGroup = hWood.plan.groups.find((x) => x.key === keyH1113);
  const uniGroup = hUni.plan.groups.find((x) => x.key === `ldsp:16:item:${W1000.item.id}`);
  const against = (plan: CuttingPlan) =>
    plan.sheets.flatMap((sheet) => sheet.placements).filter((p) => (p.piece.part.grain === 'along' && p.rotation !== 0) || (p.piece.part.grain === 'across' && p.rotation !== 90)).length;
  const hAudit = [...auditPlan(hWood.parts, hWood.plan), ...auditPlan(hUni.parts, hUni.plan), ...auditExports(hWood.parts, hWood.plan)];
  /* Человек сильнее каталога: «однотонный» на древесной группе снимает запрет, и это видно числом. */
  const said = cutOf(wood, { ...CONFIRMED, texture: { [keyH1113]: 'plain' } }, decors);
  check(
    'CUT.H древесный H1113 (каталог: Wood): текстура учитывается, против неё 0 деталей; однотонный W1000 (каталог: White & Uni) — детали поворачиваются; «однотонный» человеком на H1113 — тоже',
    hAudit.length === 0 &&
      Boolean(woodGroup?.grain) &&
      uniGroup?.grain === false &&
      against(hWood.plan) === 0 &&
      against(hUni.plan) > 0 &&
      against(said.plan) > 0 &&
      auditPlan(said.parts, said.plan).length === 0,
    hAudit.length
      ? short(hAudit)
      : `H1113: ${woodGroup?.grainNote} · листов ${woodGroup?.sheets.length} · против текстуры ${against(hWood.plan)} | W1000: ${uniGroup?.grainNote} · листов ${uniGroup?.sheets.length} · повёрнуто против направления ${against(hUni.plan)} | H1113 «однотонный» человеком: ${against(said.plan)}`,
  );

  /* ── I. Деталь не помещается на выбранный лист ── */
  const small: CuttingSettings = { ...CONFIRMED, trimMm: 25, sheets: [{ stock: 'ldsp:16', lengthMm: 2440, widthMm: 1220 }, ...SHEETS.filter((s) => s.stock !== 'ldsp:16')] };
  const i = cutOf(wardrobe, small);
  const iAudit = auditPlan(i.parts, i.plan);
  const iGroup = i.plan.groups.find((x) => x.key === 'ldsp:16:-');
  const sideMiss = iGroup?.unplaced.filter((u) => u.piece.part.name === 'Боковина') ?? [];
  check(
    'CUT.I боковина 2400 на листе 2440 × 1220 с обрезкой 25: не разложена, причина в миллиметрах (2400 при поле 2390, поворот против текстуры) — выпуск заперт; остальные детали на листах, ни одна не потеряна',
    iAudit.length === 0 &&
      sideMiss.length === 2 &&
      sideMiss.every((u) => u.reason.includes('2400') && u.reason.includes('2390') && u.reason.includes('повернуть нельзя')) &&
      !i.plan.release.ok &&
      i.plan.release.reasons.some((r) => r.startsWith('Не разложено 2 шт.')) &&
      i.plan.placed === i.plan.pieces - 2,
    iAudit.length ? short(iAudit) : `${sideMiss[0]?.reason ?? 'ОТКАЗА НЕТ'} · разложено ${i.plan.placed} из ${i.plan.pieces}`,
  );

  /* ── J. Ящики без коробов: карта неполная — выпуск заперт ── */
  const demo = kitchenScreen();
  const j = cutOf(demo, CONFIRMED);
  const drawerFronts = j.parts.filter((p) => p.name === DRAWER_FRONT_PANEL_NAME).reduce((s, p) => s + p.qty, 0);
  check(
    'CUT.J ящики под варочной: короба в раскрое нет — карта называет число ящиков и запирает выпуск; у шкафа без ящиков такой причины нет',
    drawerFronts > 0 &&
      j.plan.drawers === drawerFronts &&
      !j.plan.release.ok &&
      j.plan.release.reasons.some((r) => r.startsWith(`Ящиков ${drawerFronts}:`)) &&
      a.plan.drawers === 0 &&
      !a.plan.release.reasons.some((r) => r.startsWith('Ящиков')),
    `фронтов ящиков в деталировке ${drawerFronts} · в карте ${j.plan.drawers} · «${j.plan.release.reasons.find((r) => r.startsWith('Ящиков')) ?? 'ПРИЧИНЫ НЕТ'}»`,
  );

  /* ── K. Сохранить и открыть заново ── */
  const reopened: Screen = { ...demo, segments: JSON.parse(JSON.stringify(demo.segments)) as Run[] };
  const k = cutOf(reopened, cuttingSettings(JSON.parse(JSON.stringify(CONFIRMED))));
  const stored = productionSettings(JSON.parse(JSON.stringify({ ...DEFAULT_PRODUCTION, cutting: { ...CONFIRMED, texture: { [keyH1113]: 'plain' } } })));
  const signatures = new Set(Array.from({ length: 20 }, () => cutOf(demo, CONFIRMED).plan.signature));
  check(
    'CUT.K сохранить и открыть: ряд и настройки через JSON дают ту же раскладку до места (подпись), настройки цеха возвращаются теми же; 20 пересчётов — одна подпись',
    k.plan.signature === j.plan.signature &&
      JSON.stringify(stored.cutting) === JSON.stringify({ ...CONFIRMED, texture: { [keyH1113]: 'plain' } }) &&
      signatures.size === 1,
    `подпись ${j.plan.signature} → ${k.plan.signature} · пересчётов 20, подписей ${signatures.size}`,
  );

  /* ── Замок выпуска: лист не выбран, не подтверждено цехом, замок экрана ── */
  const noSheet = cutOf(wardrobe, { ...TYPICAL_CUTTING, confirmed: true, sheets: [{ stock: 'hdf:3', lengthMm: 2800, widthMm: 2070 }] });
  const unconfirmed = cutOf(wardrobe, { ...CONFIRMED, confirmed: false });
  const locked = cutOf(wardrobe, CONFIRMED, new Map(), 'Выгрузки для раскроя и печати для цеха нет: стена Б не собирается.');
  const noSheetGroup = noSheet.plan.groups.find((x) => x.key === 'ldsp:16:-');
  check(
    'CUT.L выпуск: без листа группа не раскладывается и названа («Лист не выбран»), детали не потеряны; «не подтверждено цехом» и замок экрана запирают выпуск словами',
    auditPlan(noSheet.parts, noSheet.plan).length === 0 &&
      Boolean(noSheetGroup && noSheetGroup.sheets.length === 0 && !noSheetGroup.format) &&
      noSheet.plan.release.reasons.some((r) => r.startsWith('Лист не выбран')) &&
      !unconfirmed.plan.release.ok &&
      unconfirmed.plan.release.reasons.some((r) => r.includes('не подтверждено цехом')) &&
      !locked.plan.release.ok &&
      locked.plan.release.reasons[0].startsWith('Выгрузки для раскроя'),
    `${noSheet.plan.release.reasons[0] ?? 'ПРИЧИНЫ НЕТ'} | ${unconfirmed.plan.release.reasons.find((r) => r.includes('цехом')) ?? 'ПРИЧИНЫ НЕТ'}`,
  );

  /* ── Проверка внутри продукта ловит испорченную раскладку ── */
  {
    const base = a.plan;
    const clone = () => JSON.parse(JSON.stringify({ sheets: base.sheets })).sheets as CutSheet[];
    /* Деталь в клоне — копия: продукт сверяет детали по идентификаторам деталировки. */
    const errorsOf = (sheets: CutSheet[]) => cuttingErrors({ groups: base.groups, sheets, parts: a.parts, settings: base.settings });
    const target = base.sheets[0];
    const twoOnFirst = target.placements.length >= 2;
    const overlap = clone();
    overlap[0].placements[1] = { ...overlap[0].placements[1], xMm: overlap[0].placements[0].xMm, yMm: overlap[0].placements[0].yMm };
    const touching = clone();
    {
      const [p0, p1] = touching[0].placements;
      /* Вплотную справа от первой, на той же высоте: пропила нет. */
      touching[0].placements[1] = { ...p1, xMm: p0.xMm + p0.wMm, yMm: p0.yMm };
    }
    const turned = clone();
    {
      const along = turned.flatMap((s) => s.placements).find((p) => p.piece.part.grain === 'along');
      if (along) Object.assign(along, { rotation: 90, wMm: along.hMm, hMm: along.wMm });
    }
    const lost = clone();
    lost[0].placements = lost[0].placements.slice(1);
    const doubled = clone();
    doubled[0].placements = [...doubled[0].placements, doubled[0].placements[0]];
    const found = {
      overlap: errorsOf(overlap).some((x) => x.includes('пересекаются')),
      touching: errorsOf(touching).some((x) => x.includes('меньше пропила')),
      turned: errorsOf(turned).some((x) => x.includes('против текстуры')),
      lost: errorsOf(lost).some((x) => x.includes('потеряна')),
      doubled: errorsOf(doubled).some((x) => x.includes('посчитана 2 раза')),
      clean: errorsOf(clone()).length === 0,
    };
    check(
      'CUT.V проверка в продукте (она запирает выпуск) ловит испорченную раскладку: пересечение, детали без пропила, поворот против текстуры, потерянную и задвоенную деталь; чистую — пропускает',
      twoOnFirst && Object.values(found).every(Boolean),
      Object.entries(found)
        .map(([key, ok]) => `${key} ${ok ? 'да' : 'НЕТ'}`)
        .join(' · '),
    );
  }

  /* ── Настройки раскроя: мусор не принимается ── */
  {
    const parsed = cuttingSettings({
      kerfMm: 4.44,
      trimMm: 60,
      minRemnantMm: 'x',
      rotate: false,
      confirmed: 'yes',
      sheets: [
        { stock: 'ldsp:16', lengthMm: 2070, widthMm: 2800 },
        { stock: 'ldsp:16', lengthMm: 2750, widthMm: 1830 },
        { stock: 'plywood:18', lengthMm: 2500, widthMm: 1250 },
        { stock: 'mdf:16:raw', lengthMm: 100, widthMm: 2000 },
      ],
      texture: { 'ldsp:16:-': 'plain', 'ldsp:16:x': 'wood' },
    });
    const zero = cuttingSettings({ kerfMm: 0 });
    check(
      'CUT.S настройки: пропил 4.44 → 4.4; обрезка 60 и остаток «x» — типовые; лист 2070 × 2800 читается как 2800 × 2070, повтор, чужой вид плиты и сторона 100 мм не принимаются; «confirmed: yes» — не подтверждение; пропил 0 — типовой',
      parsed.kerfMm === 4.4 &&
        parsed.trimMm === TYPICAL_CUTTING.trimMm &&
        parsed.minRemnantMm === TYPICAL_CUTTING.minRemnantMm &&
        parsed.rotate === false &&
        parsed.confirmed === false &&
        JSON.stringify(parsed.sheets) === JSON.stringify([{ stock: 'ldsp:16', lengthMm: 2800, widthMm: 2070 }]) &&
        JSON.stringify(parsed.texture) === JSON.stringify({ 'ldsp:16:-': 'plain' }) &&
        zero.kerfMm === TYPICAL_CUTTING.kerfMm,
      JSON.stringify(parsed),
    );
  }

  /*
   * ── Размер фасада: карта берёт деталировку ──
   *
   * Распашной шкаф 900 × 2500 по две створки — пример задачи: в деталировке
   * створка 2496 × 444, в сцене 2492 × 442. Сцена считает створку своей
   * формулой (зазор с каждой стороны каждой створки) — нашёл, не тронул;
   * её числа здесь только печатаются. В цех идёт деталировка, и карта кладёт
   * на лист именно её.
   */
  {
    const hinged = hingedWardrobeScreen();
    const h = cutOf(hinged, CONFIRMED);
    const run = hinged.segments[0];
    const boxes = runBoxes(run, { thicknessMm: DEFAULT_PRODUCTION.carcassMm, frontThicknessMm: DEFAULT_PRODUCTION.frontMm, gapMm: DEFAULT_PRODUCTION.frontGapMm });
    const scene = (moduleId: string, leaf: number) => {
      const box = boxes.find((bx) => bx.part === `${moduleId}:door:${leaf}` && bx.material === 'front');
      return box ? `${Math.round(box.scale[1] * 1000)} × ${Math.round(box.scale[0] * 1000)}` : 'нет';
    };
    const doorRows = h.parts.filter((p) => p.name === 'Фасад');
    const placed = h.plan.sheets.flatMap((sheet) => sheet.placements).filter((p) => p.piece.part.name === 'Фасад');
    const of900 = doorRows.find((p) => p.moduleId === 'tall-0@w1');
    const on900 = placed.filter((p) => p.piece.part.moduleId === 'tall-0@w1');
    check(
      'CUT.F9 размер фасада на карте — производственный, из деталировки: шкаф 900 × 2500, две створки — на листе 2496 × 444, как в деталировке; все створки — размером своей строки',
      auditPlan(h.parts, h.plan).length === 0 &&
        placed.length === doorRows.reduce((sum, p) => sum + p.qty, 0) &&
        placed.every((p) => p.piece.lengthMm === p.piece.part.lengthMm && p.piece.widthMm === p.piece.part.widthMm) &&
        of900?.lengthMm === 2496 &&
        of900?.widthMm === 444 &&
        on900.length === 2 &&
        on900.every((p) => p.wMm * p.hMm === 2496 * 444),
      `шкаф 900: деталировка ${of900?.lengthMm} × ${of900?.widthMm} × ${of900?.qty}, на листах ${on900.length} шт., сцена ${scene('tall-0@w1', 0)} и ${scene('tall-0@w1', 1)} | ` +
        doorRows
          .filter((p) => p.moduleId !== 'tall-0@w1')
          .map((p) => `шкаф 1000: деталировка ${p.lengthMm} × ${p.widthMm} × ${p.qty}, сцена ${scene(p.moduleId, 0)}`)
          .join(' | '),
    );
  }
}

/* Отдельный запуск: тот же набор, свой счёт. */
if (require.main === module) {
  let passed = 0;
  let failed = 0;
  cuttingChecks((name, condition, detail = '') => {
    if (condition) {
      passed += 1;
      console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
    } else {
      failed += 1;
      console.error(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
    }
  });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
