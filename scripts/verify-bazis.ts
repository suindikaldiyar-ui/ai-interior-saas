/**
 * ПРИЁМКА МОДЕЛИ И СКРИПТА БАЗИС (BM1–BM12) и комплекта цеха (KT1–KT8) — в `test:hardware`.
 *
 * Идёт путём экрана: `workspaceInput` → `objectInput` → `composeVariants` → `applyOps` → `panelWallsOf`, те же
 * `objectPanels`, `drillingPlan`, `runBoxesByModule`. Настоящей программы БАЗИС здесь нет: скрипт гоняется на
 * СТРОГОМ ПОДОБИИ опубликованного API — вызов, которого в документации нет, падает. Подобие считает габарит панели
 * своей матрицей из `OrientGCS` и `TranslateGCS`, поэтому проверка мест — не повтор формулы модели.
 */

import vm from 'node:vm';
import { DEFAULT_PRODUCTION, type CatalogEntryFull, type DrillingSettings, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Run, RunRequirements, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput, panelWallsOf, wallSegments } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { drillingPlan, drillingSummary, PARTS_WITHOUT_HOLES } from '../lib/millwork/drillingPlan';
import { objectPanels } from '../lib/millwork/panels';
import { bazisModel, type BazisHolesMode, type BazisModel, type BazisPanel } from '../lib/millwork/bazisModel';
import { BAZIS_SCRIPT_NAME, asciiJs, bazisImportScript } from '../lib/millwork/bazisImportScript';
import { BAZIS_MODEL_STATUS, bazisPackage } from '../lib/millwork/bazisExport';
import { runBoxes } from '../lib/millwork/cabinetBoxes';
import { LESSON_CABINET, drillingReadiness, itemFacts, kitCandidates, kitPlan, lessonCabinet, planReadiness } from '../lib/millwork/drillingKit';
import { fittingItemId, shelfSupportCount } from '../lib/millwork/fittings';
import { buildEstimate } from '../lib/millwork/estimate';
import { allModules } from '../lib/millwork/layout';
import { unzipStored as readZip, zipFiles } from '../lib/millwork/zip';
import { SPECS, buildObject } from './corner-quality-fixture';
import { baselineRun } from './p1-baseline';

type Check = (name: string, ok: boolean, detail?: string) => void;

const CATALOG = hardwareCatalog(
  HARDWARE_FACTS.map((fact) => {
    const row = hardwareCatalogRow(fact);
    return {
      id: `hw:${fact.article}`, org_id: 'org', category_id: 'cat', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '',
      price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: { hardware: fact.hardware }, is_active: true, assets: [],
    } as unknown as CatalogEntryFull;
  }),
);
const item = (article: string) => {
  const found = Array.from(CATALOG.values()).find((x) => x.article === article);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${article} нет в фактах`);
  return found;
};

/** Значения приёмки — проба движка, а не рекомендация цеху: продукт сам ни одно из них не подставляет. */
const RULES: DrillingSettings = {
  hingeEdgeMm: 100,
  hingeCount: [{ upToMm: 900, hinges: 2 }, { upToMm: 1600, hinges: 3 }],
  plateOnCupAxis: true,
  handleHoleMm: 5,
  handlePlaceConfirmed: true,
  shelfSupport: { frontMm: 37, backMm: 37 },
  confirmat: { faceDiameterMm: 7, edgeDiameterMm: 5, edgeDepthMm: 50, fromFrontMm: 50, fromBackMm: 50 },
  minRemainMm: 3,
  runnerHole: { diameterMm: 2.5, depthMm: 12 },
  noDrillParts: [],
  confirmed: true,
};
const KIT = {
  /* 71B3550: положение саморезов чашки не напечатано — выпуск заперт; 71B3590 — напечатано (приёмка KT6). */
  hinge: item('MFR-BLUM-71B3590').id,
  hinge_plate: item('MFR-BLUM-173L8130').id,
  handle: item('MFR-HAFELE-115.52.630').id,
};
const supportWithHoles = kitCandidates('shelf_support', CATALOG).find((x) => {
  const d = x.hardware.drilling?.find((s) => s.part === 'cabinet_side' || s.part === 'other');
  return d && d.diameterMm !== null && d.depthMm !== null;
});

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;

function kitchen(production: ProductionSettings) {
  const base = workspaceInput({ title: 'BM', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  const run = composeVariants(input, DISABLED, {}).find((v) => v.key === 'optimal')!.run;
  return { input, run };
}

const META = { projectId: 'BM', title: 'Кухня 3800', date: '2026-11-05', fingerprint: 'test' };
const optionsOf = (production: ProductionSettings) => ({ thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, hardware: CATALOG, production });

function modelOf(run: Run, production: ProductionSettings, holesMode: BazisHolesMode, walls = panelWallsOf(null, wallSegments(null, run, {}), run.wallId ?? 'w1')): { model: BazisModel; plan: ReturnType<typeof drillingPlan> } {
  const plan = drillingPlan({ walls, production, hardware: CATALOG });
  const panels = objectPanels({ walls, production, hardware: CATALOG });
  return { plan, model: bazisModel({ meta: META, panels, plan, walls, options: optionsOf(production), holesMode }) };
}

/* ─────────────────────────── подобие API БАЗИС ─────────────────────────── */

type V = { x: number; y: number; z: number };

/**
 * Панель подобия: матрица ЛСК → ГСК. Только члены, что есть в описании API; обращение к другому свойству объекта
 * падает. Толщина — от нуля по +Z, как у панели `front` с единичной матрицей.
 */
function strictPanel(width: number, height: number, thickness: number, log: { circles: number; butts: number[]; cuts: { thickness: number; x: number; y: number; r: number }[] }, quirk: Quirk) {
  const state = { ax: { x: 1, y: 0, z: 0 } as V, ay: { x: 0, y: 1, z: 0 } as V, az: { x: 0, y: 0, z: 1 } as V, o: { x: 0, y: 0, z: 0 } as V };
  const contour = {
    list: [] as unknown[],
    Clear() { this.list = []; },
    AddLine(x1: number, y1: number, x2: number, y2: number) { this.list.push(['line', x1, y1, x2, y2]); return {}; },
    AddCircle(x: number, y: number, r: number) { this.list.push(['circle', x, y, r]); log.circles += 1; return {}; },
  };
  /* Куда от контура идёт толщина, в документации не сказано: скрипт обязан встать верно при обоих ответах. */
  const gMin = (): V => ({ x: 0, y: 0, z: quirk.thicknessDown ? -thickness : 0 });
  const body = {
    Name: '',
    Contour: contour,
    Owner: null as unknown,
    TextureOrientation: 0,
    Build() {},
    get GabMin() { return gMin(); },
    get GabMax() { return { x: width, y: height, z: quirk.thicknessDown ? 0 : thickness }; },
    ToGlobal(p: V): V {
      return {
        x: state.o.x + state.ax.x * p.x + state.ay.x * p.y + state.az.x * p.z,
        y: state.o.y + state.ax.y * p.x + state.ay.y * p.y + state.az.y * p.z,
        z: state.o.z + state.ax.z * p.x + state.ay.z * p.y + state.az.z * p.z,
      };
    },
    OrientGCS(z: V, y: V) {
      state.az = z;
      state.ay = y;
      state.ax = { x: y.y * z.z - y.z * z.y, y: y.z * z.x - y.x * z.z, z: y.x * z.y - y.y * z.x };
    },
    TranslateGCS(d: V) {
      state.o = { x: state.o.x + d.x + (quirk.shiftMm ?? 0), y: state.o.y + d.y, z: state.o.z + d.z };
    },
  };
  return new Proxy(body, {
    get(target, key: string) {
      if (key in target) return (target as Record<string, unknown>)[key];
      throw new Error(`вызова Panel.${String(key)} в описании API нет`);
    },
    set(target, key: string, value) {
      if (!(key in target) && key !== 'Thickness' && key !== 'MaterialName') throw new Error(`свойства Panel.${String(key)} в описании API нет`);
      (target as Record<string, unknown>)[key] = value;
      return true;
    },
  });
}

type Quirk = { thicknessDown?: boolean; shiftMm?: number };

export function runScript(script: string, mode: 'modern' | 'legacy', quirk: Quirk = {}) {
  const panels: { name: string; panel: ReturnType<typeof strictPanel>; log: { circles: number; butts: number[]; cuts: { thickness: number; x: number; y: number; r: number }[] }; material: string }[] = [];
  const boxes: string[] = [];
  const said: string[] = [];
  let active = { name: '', thickness: 16 };
  const vector = (x: number, y: number, z: number): V => ({ x, y, z });
  const last = () => panels[panels.length - 1];
  const make = (w: number, h: number, material: string) => {
    const log = { circles: 0, butts: [] as number[], cuts: [] as { thickness: number; x: number; y: number; r: number }[] };
    const panel = strictPanel(w, h, active.thickness, log, quirk);
    panels.push({ name: '', panel, log, material });
    return panel;
  };
  const sandbox: Record<string, unknown> = {
    console: { log: (s: string) => said.push(String(s)) },
    TextureOrientation: { None: 0, Horizontal: 1, Vertical: 2 },
  };
  if (mode === 'modern') {
    Object.assign(sandbox, {
      objects3d: {
        PanelOrientation: { front: 0, vertical: 1, horizont: 2 },
        NewPanel: (w: number, h: number) => make(w, h, active.name),
        NewBlock: (name: string) => {
          boxes.push(name);
          return { Name: name };
        },
      },
      geometry3d: { VectorMake: vector },
      materialData: {
        SetupActiveMaterial: (name: string, thickness: number) => { active = { name, thickness }; },
        SetupActiveButtMaterial: () => {},
      },
      panelOperations: {
        cutType: { extrusion: 1 },
        AddButt: (_panel: unknown, i: number) => { last().log.butts.push(i); },
        AddCut: () => {
          const cut = { thickness: 0, x: 0, y: 0, r: 0 };
          last().log.cuts.push(cut);
          return { Contour: { AddCircle(x: number, y: number, r: number) { Object.assign(cut, { x, y, r }); } }, set Thickness(v: number) { cut.thickness = v; } };
        },
      },
      historyOperations: { CommitCurrentChanges: () => {} },
      UI: { dialogs: { MessageBox: (s: string) => said.push(`MessageBox: ${s}`) } },
    });
  } else {
    Object.assign(sandbox, {
      AddPanel: (w: number, h: number) => {
        active = { name: '', thickness: 16 };
        const p = make(w, h, '');
        return new Proxy(p, {
          get(target, key: string) {
            if (key === 'AddButt') return (_m: string, i: number) => last().log.butts.push(i);
            return (target as unknown as Record<string, unknown>)[key];
          },
        });
      },
      NewVector: vector,
      alert: (s: string) => said.push(`alert: ${s}`),
    });
  }
  vm.runInNewContext(script, sandbox);
  return { panels, said, boxes };
}

/* ─────────────────────────── приёмка ─────────────────────────── */

export function verifyBazisModel(check: Check): void {
  if (!supportWithHoles) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в фактах нет полкодержателя с напечатанными Ø и глубиной');
  const kit = { ...KIT, shelf_support: supportWithHoles.id };
  const production: ProductionSettings = { ...DEFAULT_PRODUCTION, drilling: { ...RULES, kit } };
  const { input, run: run0 } = kitchen(production);

  /* ── KT: комплект на ряд ── */
  const walls0 = panelWallsOf(null, wallSegments(null, run0, {}), input.runWallId);
  const planned = kitPlan({ walls: walls0, kit, hardware: CATALOG, production });
  const req: RunRequirements = DEMO_REQUIREMENTS;
  const ops = planned.ops[walls0[0].wallId] ?? [];
  const run = applyOps({ run: run0, requirements: req, ops, hardware: CATALOG });
  const units = allModules(run);
  const kept = units.filter((u) => fittingItemId(u, 'hinge') === kit.hinge).length;
  check(
    'KT1 комплект на все модули одним действием: те же `set_fitting` и та же проверка паспорта; встало и не встало считаны, не вставшее — словами',
    planned.set > 0 && ops.length === planned.set && kept > 0 && planned.rows.filter((r) => r.state === 'refused').every((r) => r.words.length > 0),
    `встанет ${planned.set}, своя позиция ${planned.kept}, отказ ${planned.refused} · петли на ${kept} модулях`,
  );
  check('KT1г у позиций комплекта нет цены — это названо до нажатия (итог станет «неполным»)', planned.unpriced.length > 0, planned.unpriced.join(', '));
  const second = kitPlan({ walls: [{ ...walls0[0], run }], kit, hardware: CATALOG, production });
  check(
    'KT1в второе нажатие ставить нечего: всё, что встало, держится на модулях',
    second.set === 0 && second.kept >= planned.set,
    `встанет ещё ${second.set}: ${second.rows.filter((r) => r.state === 'set').map((r) => `${r.moduleId}/${r.slot}`).join(', ')} · своя позиция ${second.kept}`,
  );
  const longSlide = kitPlan({ walls: walls0, kit: { slide: item('MFR-HETTICH-9114277').id }, hardware: CATALOG, production });
  check(
    'KT1б направляющая длиннее корпуса на модули не ложится: операций нет, отказ словами с миллиметрами той же проверки паспорта',
    longSlide.refused > 0 && longSlide.set === 0 && longSlide.rows.filter((r) => r.state === 'refused').every((r) => /мм/.test(r.words)),
    `отказ ${longSlide.refused}: ${longSlide.rows.find((r) => r.state === 'refused')?.words ?? 'нет'}`,
  );
  const human = applyOps({ run: run0, requirements: req, ops: [{ op: 'set_fitting', moduleId: units.find((u) => fittingItemId(u, 'hinge'))!.id, slot: 'hinge', itemId: item('MFR-BLUM-71B3580').id } as MillworkOp], hardware: CATALOG });
  const again = kitPlan({ walls: [{ ...walls0[0], run: human }], kit, hardware: CATALOG, production });
  check(
    'KT2 поставленное человеком комплект не трогает: на этом месте `kept`, позиция прежняя и после применения',
    again.kept >= 1 && !(again.ops[walls0[0].wallId] ?? []).some((op) => (op as { moduleId: string; slot: string }).moduleId === units.find((u) => fittingItemId(u, 'hinge'))!.id && (op as { slot: string }).slot === 'hinge'),
    `своя позиция ${again.kept}`,
  );
  const noKit = kitPlan({ walls: walls0, kit: {}, hardware: CATALOG, production });
  check('KT3 пустой комплект ничего не ставит и называет пустые места', noKit.set === 0 && noKit.empty.length > 0, noKit.empty.join(', '));

  const empty = drillingReadiness({ rules: null, hardware: CATALOG, production: DEFAULT_PRODUCTION });
  check(
    'KT4 готовность пустых настроек: ни одного числа цеха не подставлено, факты «не рассчитано», итог — выбор изделия',
    empty.state === 'needs_item' && empty.steps.flatMap((s) => s.facts).every((f) => f.level === 'missing' && f.value === null) && empty.steps.find((s) => s.key === 'confirm')?.state === 'needs_confirm',
    `${empty.title} · шагов ${empty.steps.length}`,
  );
  const unconfirmed = drillingReadiness({ rules: { ...RULES, kit, confirmed: false }, hardware: CATALOG, production: { ...production, drawerBox: { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: false } } });
  const levels = new Set(unconfirmed.steps.flatMap((s) => s.facts).map((f) => f.level));
  check(
    'KT5 уровни не смешаны: числа производителя — «Подтверждено производителем», числа цеха без галочки — «Требует подтверждения»; галочка сама не ставится',
    levels.has('manufacturer') && levels.has('unconfirmed') && !levels.has('shop') && unconfirmed.steps.find((s) => s.key === 'confirm')?.state === 'needs_confirm',
    `${Array.from(levels).join(', ')} · ${unconfirmed.title} · ${unconfirmed.steps.filter((s) => s.state !== 'ready').map((s) => `${s.key}:${s.state}`).join(' ')}`,
  );

  const lesson = lessonCabinet({ production, hardware: CATALOG });
  const unit = lesson.run.modules[0];
  const summary = drillingSummary(lesson.plan);
  const names = lesson.plan.parts.map((p) => p.name).sort().join(', ');
  const side = lesson.plan.parts.find((p) => p.role === 'side_left');
  check(
    `KT6 учебный шкаф ${LESSON_CABINET.widthMm} × ${LESSON_CABINET.heightMm} × ${LESSON_CABINET.depthMm}: две двери, одна полка — движок и присадка те же; выпуск открыт при подтверждённых правилах и выбранных изделиях`,
    unit.widthMm === 600 && unit.doorCount === 2 && (unit.fill?.shelves.length ?? 0) === 1 && summary.ops > 0 && lesson.plan.release.open && (side?.lengthMm ?? 0) === 720,
    `дверей ${unit.doorCount}, полок ${unit.fill?.shelves.length}, деталей ${summary.parts}, операций ${summary.ops}, выпуск ${lesson.plan.release.open ? 'открыт' : lesson.plan.release.reasons.join(' | ')} · ${lesson.plan.parts.flatMap((p) => p.pending.map((x) => `${p.name}: ${x.what}: ${x.why[0]}`)).join(' | ')} · проверки ${lesson.plan.issues.map((i) => i.words).join(' | ')}`,
  );
  const lessonDraft = lessonCabinet({ production: { ...production, drilling: { ...production.drilling!, confirmed: false } }, hardware: CATALOG });
  check(
    'KT7 тот же шкаф без галочки цеха: отверстия те же, выпуск заперт — «не подтверждены цехом»; состояние — «Требуется подтверждение»',
    drillingSummary(lessonDraft.plan).ops === summary.ops && !lessonDraft.plan.release.open && planReadiness(lessonDraft.plan, lessonDraft.plan ? { ...RULES, confirmed: false } : null).state === 'needs_confirm',
    lessonDraft.plan.release.reasons.join(' | '),
  );
  const silent = drillingPlan({ walls: panelWallsOf(null, wallSegments(null, run, {}), input.runWallId), production, hardware: CATALOG }).parts.filter((p) => p.ops.length === 0 && p.pending.length === 0);
  check(
    'KT8 молчаливых деталей нет: деталь без отверстий и без причины — только полка и задняя стенка (схема сборки) и то, что цех отметил «без присадки»',
    silent.length > 0 && silent.every((p) => PARTS_WITHOUT_HOLES.includes(p.name)),
    `молча ${silent.length}: ${Array.from(new Set(silent.map((p) => p.name))).join(', ')}`,
  );

  const estimate = buildEstimate(run, 'optimal', DEMO_RATES, [], undefined, production, CATALOG);
  const pins = estimate.lines.filter((l) => l.key.startsWith('fitting_shelf_support_'));
  const wanted = units.filter((u) => fittingItemId(u, 'shelf_support') === kit.shelf_support).reduce((s, u) => s + shelfSupportCount(u), 0);
  check(
    'KT9 полкодержатель с модуля — своей строкой сметы: штук столько же, сколько отверстий считает присадка, без цены — «цена не задана»',
    wanted > 0 && pins.length === 1 && pins[0].quantity === wanted,
    `${pins.map((l) => `${l.key} × ${l.quantity}`).join(', ') || 'строки нет'} · нужно ${wanted}`,
  );
  const screwsOpen = itemFacts('hinge', item('MFR-BLUM-71B3550'));
  const screwsKnown = itemFacts('hinge', item('MFR-BLUM-71B3590'));
  check(
    'KT10 подбор петли не обещает выпуск, которого не будет: у 71B3550 саморезы чашки не образмерены — «неполная»; у 71B3590 — полная',
    !screwsOpen.complete && screwsOpen.why.some((w) => w.includes('саморезов')) && screwsKnown.complete,
    `71B3550: ${screwsOpen.why.join('; ')} · 71B3590: ${screwsKnown.complete}`,
  );
  const fillerRun = baselineRun('wardrobe-combined', 4000);
  if ('refused' in fillerRun) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: wardrobe-combined@4000 не собрался: ${fillerRun.refused}`);
  const fillerOf = (noDrillParts: string[]) =>
    drillingPlan({ walls: [{ wallId: 'w1', label: 'Стена А', run: fillerRun }], production: { ...production, drilling: { ...production.drilling!, noDrillParts } }, hardware: CATALOG }).parts.find((p) => p.name === 'Доборная планка');
  const named = fillerOf([]);
  const freed = fillerOf(['Доборная планка']);
  check(
    'KT8б доборная планка без присадки не молчит: «схема крепления — правило цеха не задано»; отметил цех «без присадки» — причины нет',
    Boolean(named) && named!.pending.some((x) => x.what === 'крепление: Доборная планка' && x.why[0].includes('правило цеха не задано')) && freed?.pending.length === 0,
    `${named?.pending.map((x) => `${x.what}: ${x.why[0]}`).join(' | ') ?? 'планки нет'} → ${freed?.pending.length ?? 'планки нет'}`,
  );

  /* ── BM: модель ── */
  const { model, plan } = modelOf(run, production, 'issued');
  const pieces = objectPanels({ walls: panelWallsOf(null, wallSegments(null, run, {}), input.runWallId), production, hardware: CATALOG }).reduce((s, p) => s + p.qty, 0);
  const carcassParts = model.panels.filter((p) => !p.id.startsWith('countertop:'));
  check(
    'BM1 деталей в модели = штук раскроя; у каждой размеры деталировки и материал; столешница — своей записью и своим материалом',
    carcassParts.length === pieces && model.panels.some((p) => p.name === 'Столешница') && model.materials.some((m) => m.kind === 'countertop') && model.panels.every((p) => model.materials.some((m) => m.key === p.materialKey)),
    `штук ${pieces} = ${carcassParts.length}, плит ${model.panels.length - carcassParts.length}, материалов ${model.materials.length}, без места ${model.counts.unplaced}`,
  );
  const placedParts = model.panels.filter((p) => p.placed);
  const dotv = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ortho = placedParts.every((p) => Math.abs(dotv(p.axisX, p.axisY)) < 1e-5 && Math.abs(dotv(p.axisX, p.axisZ)) < 1e-5 && Math.abs(dotv(p.axisY, p.axisZ)) < 1e-5);
  const sizes = placedParts.every((p) => {
    const box = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]].map((v) => Math.round(v)).sort((a, b) => a - b).join('×');
    return box === [p.lengthMm, p.widthMm, p.thicknessMm].map((v) => Math.round(v)).sort((a, b) => a - b).join('×');
  });
  check('BM2 оси каждой детали взаимно перпендикулярны, габарит в мире = размерам детали', placedParts.length > 0 && ortho && sizes, `деталей с местом ${placedParts.length}`);

  const scene = runBoxes(run, optionsOf(production));
  const inScene = (p: BazisPanel) =>
    scene.some((b) => {
      const box = b as { position: [number, number, number]; scale: [number, number, number] };
      const toWorld = (v: number, i: number) => (i === 0 ? v - run.lengthMm / 2000 : v) * 1000;
      return [0, 1, 2].every((i) => Math.abs(toWorld(box.position[i] - box.scale[i] / 2, i) - p.min[i]) < 1.5 && Math.abs(toWorld(box.position[i] + box.scale[i] / 2, i) - p.max[i]) < 1.5);
    });
  const sides = model.panels.filter((p) => p.name === 'Боковина');
  check(
    'BM3 боковины стоят там же, где в сцене (коробка `runBoxes` в мире, ряд от −L/2): каждая на месте до 1.5 мм',
    sides.length > 0 && sides.every(inScene),
    `боковин ${sides.length}, не на месте ${sides.filter((p) => !inScene(p)).length}`,
  );
  const door = model.panels.find((p) => p.name === 'Фасад' && p.edges.length === 4);
  check('BM4 кромка — по сторонам контура: у фасада все четыре отрезка, толщина как в деталировке', Boolean(door) && door!.edges.map((e) => e.element).sort().join('') === '0123' && door!.edges.every((e) => e.thicknessMm > 0), door ? `${door.number}: ${door.edges.map((e) => `${e.side}:${e.thicknessMm}`).join(' ')}` : 'фасада с кромкой нет');
  const edgedSide = model.panels.find((p) => p.name === 'Боковина' && p.edges.length === 1);
  check('BM4б одна длинная кромка боковины — передняя: отрезок 0 (y = 0, от передней кромки считают и присадка, и контур)', Boolean(edgedSide) && edgedSide!.edges[0].element === 0 && edgedSide!.edges[0].side === 'y0', edgedSide ? `${edgedSide.number}: ${edgedSide.edges.map((e) => `${e.element}:${e.side}`).join(' ')}` : 'боковины с одной кромкой нет');
  const ops2 = plan.parts.reduce((s, p) => s + p.ops.length, 0);
  check('BM5 отверстий в модели = операций плана, координаты те же', model.counts.holes + model.counts.edgeHoles === ops2 && ops2 > 0, `${model.counts.holes} на пласти + ${model.counts.edgeHoles} в торцах = ${ops2}`);
  const none = modelOf(run, production, 'none').model;
  check('BM6 при запертом выпуске отверстий в модели нет вовсе, причины названы', none.counts.holes === 0 && none.counts.edgeHoles === 0 && none.holesMode === 'none', `отверстий ${none.counts.holes}`);

  const script = bazisImportScript(model);
  const notAscii = Array.from(script).filter((c) => c.charCodeAt(0) > 127).length;
  check('BM7 скрипт — только ASCII и ES5: кириллица — \\uXXXX, стрелочных функций, const и let нет', notAscii === 0 && !/=>|\bconst\b|\blet\b/.test(script.split('(function (MODEL)')[1].split('"format"')[0]) && asciiJs('Я').length === 6, `символов не ASCII ${notAscii}, размер ${Math.round(script.length / 1024)} кБ`);

  const modern = runScript(script, 'modern');
  const worldOf = (p: (typeof modern.panels)[number]) => {
    const a = p.panel.ToGlobal(p.panel.GabMin);
    const b = p.panel.ToGlobal(p.panel.GabMax);
    return { min: [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)], max: [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)] };
  };
  const off = model.panels.filter((p, i) => {
    if (!p.placed) return false;
    const w = worldOf(modern.panels[i]);
    return [0, 1, 2].some((k) => Math.abs(w.min[k] - p.min[k]) > 0.6 || Math.abs(w.max[k] - p.max[k]) > 0.6);
  });
  const report = modern.said.join('\n');
  check(
    'BM8 скрипт на подобии современного API: панелей столько же, блоки по модулям, каждая встала на своё место своей матрицей; недокументированных вызовов нет',
    modern.panels.length === model.panels.length && off.length === 0 && modern.boxes.length > 0 && !/НЕ СОБРАЛАСЬ|Габарит не совпал/.test(report) && report.includes(`Собрано панелей: ${model.panels.length} из ${model.panels.length}`),
    `панелей ${modern.panels.length}, блоков ${modern.boxes.length}, не на месте ${off.length}${off[0] ? ` (${off[0].number} ${off[0].name})` : ''}`,
  );
  const down = runScript(script, 'modern', { thicknessDown: true });
  const offDown = model.panels.filter((p, i) => {
    if (!p.placed) return false;
    const a = down.panels[i].panel.ToGlobal(down.panels[i].panel.GabMin);
    const b = down.panels[i].panel.ToGlobal(down.panels[i].panel.GabMax);
    const lo = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)];
    const hi = [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)];
    return [0, 1, 2].some((k) => Math.abs(lo[k] - p.min[k]) > 0.6 || Math.abs(hi[k] - p.max[k]) > 0.6);
  });
  check('BM8б толщина панели от контура вниз (документация направления не называет): все панели всё равно на своём месте', offDown.length === 0, `не на месте ${offDown.length}`);
  const shifted = runScript(script, 'modern', { shiftMm: 5 }).said.join('\n');
  check('BM8в панель встала не туда — скрипт сам называет её в отчёте, а не молчит', /Габарит не совпал/.test(shifted), shifted.split('\n').find((l) => l.includes('Габарит')) ?? 'молчит');
  const cuts = modern.panels.reduce((s, p) => s + p.log.cuts.length, 0);
  const circles = modern.panels.reduce((s, p) => s + p.log.circles, 0);
  const butts = modern.panels.reduce((s, p) => s + p.log.butts.length, 0);
  const through = model.panels.flatMap((p) => p.holes).filter((h) => h.face && h.through).length;
  const blind = model.panels.flatMap((p) => p.holes).filter((h) => h.face && !h.through).length;
  check(
    'BM9 кромки и отверстия доехали: глухие — выемками, сквозные — вырезом контура, торцевые названы в отчёте',
    butts === model.counts.edges && cuts === blind && circles === through && report.includes(`Отверстий в торцах не передано: ${model.counts.edgeHoles}`),
    `кромок ${butts}, выемок ${cuts} = ${blind}, вырезов ${circles} = ${through}, торцевых ${model.counts.edgeHoles}`,
  );
  const faceA = model.panels.find((p) => p.holes.some((h) => h.face === 'A' && !h.through))!;
  const faceB = model.panels.find((p) => p.holes.some((h) => h.face === 'B' && !h.through))!;
  const sign = (p: BazisPanel, face: 'A' | 'B') => {
    const i = model.panels.indexOf(p);
    const h = p.holes.filter((x) => x.face && !x.through);
    const k = h.findIndex((x) => x.face === face);
    return { thickness: modern.panels[i].log.cuts[k].thickness, plus: p.faceAOnPlusZ };
  };
  const sa = sign(faceA, 'A');
  const sb = sign(faceB, 'B');
  check(
    'BM10 глубина выемки — с нужной пласти: со стороны +Z — отрицательная толщина (от максимальной глубины), с другой — положительная (пример «Выемка» документации)',
    (sa.plus ? sa.thickness < 0 : sa.thickness > 0) && (sb.plus ? sb.thickness > 0 : sb.thickness < 0),
    `A: ${sa.thickness} при A на +Z ${sa.plus} · B: ${sb.thickness} при A на +Z ${sb.plus}`,
  );
  const legacy = runScript(script, 'legacy');
  check(
    'BM11 прежнее API: панели собираются, глухие отверстия не передаются и названы числом',
    legacy.panels.length === model.panels.length && legacy.said.join('\n').includes(`Глухих отверстий не передано: ${blind}`),
    `панелей ${legacy.panels.length}`,
  );
  let refused = '';
  try {
    runScript(script.replace('panel.OrientGCS(', 'panel.OrientNowhere('), 'modern');
    const broken = runScript(script.replace('panel.OrientGCS(', 'panel.OrientNowhere('), 'modern').said.join('\n');
    refused = /НЕ СОБРАЛАСЬ/.test(broken) ? 'ok' : 'тихо прошло';
  } catch (error) {
    refused = `падение: ${(error as Error).message}`;
  }
  check('BM11б подобие строгое: вызов, которого нет в описании, называется, а не проходит молча', refused === 'ok', refused);

  for (const spec of SPECS.filter((s) => s.key === 'l' || s.key === 'u')) {
    const object = buildObject(spec);
    const { layout, segments, places, input: objInput } = object.engine;
    const wallsU = panelWallsOf(layout, segments, objInput.runWallId).map((w, i) => ({ ...w, placement: places[i] }));
    const planU = drillingPlan({ walls: wallsU, production: DEFAULT_PRODUCTION, hardware: CATALOG });
    const panelsU = objectPanels({ walls: wallsU, production: DEFAULT_PRODUCTION, hardware: CATALOG });
    const modelU = bazisModel({ meta: META, panels: panelsU, plan: planU, walls: wallsU, options: optionsOf(DEFAULT_PRODUCTION), holesMode: 'none' });
    const outside: string[] = [];
    let measured = 0;
    object.rows.forEach((row, i) => {
      const wall = wallsU[i];
      for (const unit of row.modules) {
        const key = `${wall.wallId}:${unit.id}`;
        for (const p of modelU.panels.filter((x) => x.moduleId === key && x.name === 'Боковина')) {
          measured += 1;
          const [lo, hi] = [unit.world.min, unit.world.max];
          if ([0, 1, 2].some((k) => p.min[k] < lo[k] - 1 || p.max[k] > hi[k] + 1)) outside.push(`${wall.label} ${p.number}`);
        }
      }
    });
    const turned = modelU.panels.filter((p) => p.wall !== modelU.panels[0].wall && p.placed && p.name === 'Боковина' && Math.abs(p.axisY[0]) > 0.9).length;
    check(
      `BM14 ${spec.title}: боковины каждой стены — внутри своего модуля в мире (та же фикстура, что STAGE A), ряды соседних стен повёрнуты`,
      measured > 0 && outside.length === 0 && turned > 0,
      `боковин ${measured}, вне модуля ${outside.length}${outside[0] ? ` (${outside.slice(0, 3).join(', ')})` : ''}, повёрнутых ${turned}`,
    );
  }

  const draftPackage = (draftHoles: boolean, open: boolean) => {
    const shop: ProductionSettings = open ? production : { ...production, drilling: { ...production.drilling!, confirmed: false } };
    const walls = panelWallsOf(null, wallSegments(null, run, {}), input.runWallId);
    const p = drillingPlan({ walls, production: shop, hardware: CATALOG });
    return bazisPackage({
      meta: META,
      panels: objectPanels({ walls, production: shop, hardware: CATALOG }),
      plan: p,
      lines: [],
      hardware: CATALOG,
      walls: walls.map((w) => ({ label: w.label, boxes: runBoxes(w.run, optionsOf(shop)) })),
      exportLock: null,
      modelWalls: walls,
      boxOptions: optionsOf(shop),
      draftHoles,
    });
  };
  const closed = draftPackage(false, false);
  const draft = draftPackage(true, false);
  const closedNames = closed.files.map((f) => f.name);
  const draftScript = String(draft.files.find((f) => f.name === BAZIS_SCRIPT_NAME)?.data ?? '');
  check(
    'BM12 выпуск заперт: файлов присадки нет, в скрипте отверстий нет; черновик — только явным выбором, с пометкой, файлов присадки для цеха нет и там',
    !closedNames.some((n) => n.startsWith('drilling') || n.startsWith('dxf/')) &&
      closed.model?.counts.holes === 0 &&
      draft.model?.holesMode === 'draft' &&
      (draft.model?.counts.holes ?? 0) > 0 &&
      !draft.files.some((f) => f.name.startsWith('drilling') || f.name.startsWith('dxf/')) &&
      /"holesMode":"draft"/.test(draftScript),
    `закрыт: ${closedNames.join(', ')} · черновик: отверстий ${draft.model?.counts.holes}`,
  );
  const open = draftPackage(false, true);
  const zip = readZip(zipFiles(open.files, META.date));
  const names2 = zip.map((f) => f.name);
  const readModel = JSON.parse(new TextDecoder().decode(zip.find((f) => f.name === 'aldik-model.json')!.data)) as BazisModel;
  const manifest = JSON.parse(new TextDecoder().decode(zip.find((f) => f.name === 'manifest.json')!.data));
  const scriptFromZip = new TextDecoder().decode(zip.find((f) => f.name === BAZIS_SCRIPT_NAME)!.data);
  const rerun = runScript(scriptFromZip, 'modern');
  check(
    'BM13 пакет прочитан обратно из ZIP: скрипт, модель, манифест на месте, статус честный, расширений закрытых форматов нет; скрипт из архива собирает то же',
    names2.includes(BAZIS_SCRIPT_NAME) && readModel.counts.panels === open.model!.counts.panels && manifest.model.status === BAZIS_MODEL_STATUS && !names2.some((n) => /\.(b3d|f3d|fr3d|cfrn)$/i.test(n)) && rerun.panels.length === readModel.panels.length,
    `файлов ${names2.length}, панелей ${readModel.counts.panels}, статус «${manifest.model.status}»`,
  );
}
