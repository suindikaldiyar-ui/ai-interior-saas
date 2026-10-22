/**
 * STAGE 01 — РАЗМЕРЫ, АНТРЕСОЛЬ, НЕЗАВИСИМАЯ ГЛУБИНА (входит в test:millwork).
 *
 * Отдельный запуск: `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-stage01.ts`
 * (JSX чертежа — как у `test:millwork`) — тот же набор, свой
 * счёт (для отката правки при сохранённом тесте).
 *
 * Всё идёт ПУТЁМ ЭКРАНА: `workspaceInput` → `composeVariants` → правка
 * `applyOps` (как `runOps`, в `editedRuns`) → `composeVariants` снова; у
 * угловой и П-образной кухни — `compositionFor` → `wallSegments` с правкой
 * стен Б и В. Правленый ряд сверяется с тем же рядом БЕЗ правки на тех же
 * отметках: место, высота и глубина каждого модуля (`runPlaces` — по ним
 * стоит сцена) и детали раскроя (`buildPanels`). Разошлись — показано, где и
 * на сколько. Ещё: хвост сужения по шаблону (S01.13) и развёртка зон из
 * секций против `runPlaces` (S01.14, `ElevationDrawing` через
 * `renderToStaticMarkup`).
 */
import { applyOps } from '../lib/millwork/ops';
import { DEFAULT_REQUIREMENTS, composeVariants, workspaceInput } from '../lib/millwork/workspace';
import {
  compositionFor,
  objectInput,
  objectSite,
  projectOffer,
  wallCornerOf,
  wallRequirementsOf,
  wallSegments,
  withWallEdit,
} from '../lib/millwork/objectEstimate';
import { runPlaces } from '../lib/millwork/cabinetBoxes';
import { buildPanels } from '../lib/millwork/panels';
import { OBJECT_MARKS, productionFor, withMark } from '../lib/millwork/shop';
import { markShownMm, marksOfZone, moduleCarcassHeightMm } from '../lib/millwork/fill';
import { contextChange } from '../lib/millwork/runContext';
import { contextMismatches, mismatchPriceText, wallMismatchMessage } from '../lib/millwork/walls';
import { allModules } from '../lib/millwork/layout';
import { MIN_WIDTH } from '../lib/millwork/modules';
import { DEFAULT_MEZZANINE_MM } from '../lib/millwork/sections';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ElevationDrawing from '../components/millwork/ElevationDrawing';
import { DEMO_MEASUREMENT, DEMO_PROJECT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { DEFAULT_PRODUCTION, type ProductionOverrides, type ProductionSettings } from '../types/catalog';
import type { CompositionKind, Measurement, Module, Run, RunRequirements, VariantKey, ZoneKind } from '../types/millwork';
import type { MillworkState } from '../lib/projects';

type Check = (name: string, condition: boolean, detail?: string) => void;

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const MM = 1000;

const markOf = (key: string) => {
  const found = OBJECT_MARKS.find((m) => m.key === key);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: отметки «${key}» в OBJECT_MARKS нет`);
  return found;
};
/** Отметки объекта так, как их пишет поле «Размеры» (`withMark`). */
const marks = (pairs: [string, number][]): ProductionOverrides | undefined =>
  pairs.reduce<ProductionOverrides | undefined>((own, [key, value]) => withMark(own, markOf(key), value), undefined);

/** Место, высота, глубина и ширина модуля — ровно то, по чему стоит сцена. */
function shapeOf(run: Run): Map<string, string> {
  return new Map(
    runPlaces(run).map((p) => [
      p.unit.id,
      `x ${Math.round(p.x * MM)} · низ ${Math.round(p.y * MM)} · выс ${Math.round(p.heightM * MM)} · глуб ${Math.round(p.depthM * MM)} · шир ${p.unit.widthMm}`,
    ]),
  );
}

/** Детали раскроя по модулю: имя и размеры, без материала (материал правки свой). */
function cutOf(run: Run): Map<string, string> {
  const out = new Map<string, string[]>();
  for (const panel of buildPanels({ run })) {
    const key = panel.moduleId;
    const list = out.get(key) ?? [];
    list.push(`${panel.name} ${panel.lengthMm}×${panel.widthMm}×${panel.thicknessMm}×${panel.qty}`);
    out.set(key, list);
  }
  return new Map(Array.from(out.entries()).map(([key, list]) => [key, list.sort().join(' | ')]));
}

/** Где две карты разошлись: «id: было → стало», не больше четырёх. */
function drift(shown: Map<string, string>, expected: Map<string, string>): string[] {
  const out: string[] = [];
  expected.forEach((want, id) => {
    const got = shown.get(id);
    if (got !== want) out.push(`${id}: ${got ?? 'НЕТ'} ≠ ${want}`);
  });
  shown.forEach((_, id) => {
    if (!expected.has(id)) out.push(`${id}: лишний`);
  });
  return out;
}

const DEMO_ZONE = DEMO_PROJECT.zone;

/** Вход рабочего места прямой кухни (демо-замер) на этих настройках цеха. */
function kitchenInput(production: ProductionSettings, measurement: Measurement = DEMO_MEASUREMENT) {
  return workspaceInput({
    title: 'Проверка STAGE 01',
    zone: DEMO_ZONE,
    measurement,
    requirements: DEMO_REQUIREMENTS,
    rates: DEMO_RATES,
    wallId: 'w1',
    cornerAt: DEMO_PROJECT.cornerAt,
    production,
  });
}

const shownOf = (input: ReturnType<typeof kitchenInput>, edited: Partial<Record<VariantKey, Run>>) =>
  composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!;

/** Правка, не меняющая габарит: эмаль на фасад одного нижнего модуля. Ряд становится правленым. */
function editedOnce(run: Run, requirements: RunRequirements, openings: ReturnType<typeof kitchenInput>['openings']): { run: Run; moduleId: string } {
  const target = run.modules.find((unit) => unit.kind === 'base' && !unit.appliance && !unit.column);
  if (!target) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в ряду нет обычного нижнего модуля — править нечего');
  const next = applyOps({ run, requirements, ops: [{ op: 'set_front', moduleId: target.id, front: { base: 'mdf_enamel', construct: 'solid', finish: 'matte' } }], openings });
  const front = next.modules.find((unit) => unit.id === target.id)?.front;
  if (front?.base !== 'mdf_enamel') throw new Error(`правка не легла: ${target.id} — ${next.warnings.join(' | ')}`);
  return { run: next, moduleId: target.id };
}

/** Сумма фронтов ящиков против высоты корпуса — у каждого модуля с ящиками (ловушка 83). */
function frontsVsCarcass(run: Run): { checked: number; bad: string[] } {
  const bad: string[] = [];
  let checked = 0;
  for (const unit of allModules(run)) {
    const fronts = unit.fill?.drawerHeights ?? [];
    if (fronts.length === 0) continue;
    checked += 1;
    const sum = fronts.reduce((total, h) => total + h, 0);
    const height = moduleCarcassHeightMm(unit, run);
    if (sum !== height) bad.push(`${unit.id}: фронты ${sum} при корпусе ${height}`);
  }
  return { checked, bad };
}

/** Вторая школа цеха — CLAUDE.md: «проверять на второй школе цеха (550/350 и 600/300)». */
const SCHOOLS: [string, ProductionSettings][] = [
  [
    'цех 550/350, боковина 760',
    {
      ...DEFAULT_PRODUCTION,
      depths: { baseMm: 550, upperMm: 350, mezzanineMm: 550 },
      heights: { plinthMm: 100, carcassMm: 760, countertopMm: 40, apronMm: 600 },
    },
  ],
  ['цех 600/300', { ...DEFAULT_PRODUCTION, depths: { baseMm: 600, upperMm: 300, mezzanineMm: 600 } }],
];

/** Угловая комната проверок слоя 55 — стена Б с ригелем, стена В с дверью. */
const CORNER_ROOM: Measurement = {
  id: 'room-corner-stage01',
  ceilingHeightMm: 2750,
  walls: [
    { id: 'a', lengthMm: 3400, angleDeg: 90, openings: [{ id: 'win-a', kind: 'window', fromCornerMm: 1300, widthMm: 1000, sillMm: 900, heightMm: 1400 }] },
    { id: 'b', lengthMm: 2600, angleDeg: 90, openings: [] },
    { id: 'c', lengthMm: 3400, angleDeg: 90, openings: [] },
  ],
  comms: [],
  photos: [],
  measuredBy: 'Проверка',
  measuredAt: '2026-10-22',
  notes: '',
};

/** Угловая кухня путём экрана: композиция → вход стены А → варианты → ряды стен. */
function cornerScreen(production: ProductionSettings, editedWalls: Record<string, Run>, kind: CompositionKind = 'corner_l') {
  const base = workspaceInput({
    title: 'Угол STAGE 01',
    zone: 'Кухня',
    measurement: CORNER_ROOM,
    requirements: DEMO_REQUIREMENTS,
    rates: DEMO_RATES,
    wallId: 'a',
    cornerAt: null,
  });
  const site = objectSite(base, null);
  const attempt = compositionFor({ shape: kind, requirements: DEMO_REQUIREMENTS, cornerSolution: 'false_panel', site, production, variantKey: 'optimal' });
  if (attempt?.state !== 'built') throw new Error(`угловая не собралась: ${attempt?.state === 'refused' ? attempt.reason : 'нет композиции'}`);
  const layout = attempt.composition;
  const input = objectInput({
    base,
    resolution: null,
    requirements: wallRequirementsOf(layout, DEMO_REQUIREMENTS),
    rates: DEMO_RATES,
    production,
    milling: new Map(),
    carcass: new Map(),
    materials: new Map(),
    corner: wallCornerOf(layout),
  });
  const active = composeVariants(input, DISABLED, {}).find((variant) => variant.key === 'optimal')!;
  return { layout, segments: wallSegments(layout, active.run, editedWalls) };
}

/** Зона из секций: тот же замер без проёмов (шкаф ставят к глухой стене). */
function sectionInput(zone: ZoneKind, production: ProductionSettings) {
  const measurement: Measurement = {
    ...DEMO_MEASUREMENT,
    walls: DEMO_MEASUREMENT.walls.map((wall) => ({ ...wall, openings: [] })),
  };
  const requirements = { ...DEFAULT_REQUIREMENTS, zone, appliances: [] } as RunRequirements;
  return {
    requirements,
    input: workspaceInput({ title: 'Комната', zone, measurement, requirements, rates: DEMO_RATES, wallId: 'w1', cornerAt: null, production }),
  };
}

export function stage01Checks(check: Check): void {
  /* ═══ 1. Отметки объекта доезжают до правленого ряда стены А ═══ */
  {
    const before = kitchenInput(productionFor(undefined, undefined));
    const plain = shownOf(before, {}).run;
    const edit = editedOnce(plain, DEMO_REQUIREMENTS, before.openings);

    const own = marks([
      ['plinthMm', 150],
      ['carcassMm', 760],
      ['countertopMm', 30],
      ['apronMm', 600],
      ['baseMm', 450],
      ['upperMm', 250],
      ['mezzanineMm', 350],
    ]);
    const after = kitchenInput(productionFor(undefined, own));
    const template = shownOf(after, {}).run;
    const shown = shownOf(after, { optimal: edit.run }).run;

    const geometry = drift(shapeOf(shown), shapeOf(template));
    const cutShown = cutOf(shown);
    const cutTemplate = cutOf(template);
    cutShown.delete(edit.moduleId);
    cutTemplate.delete(edit.moduleId);
    const cut = drift(cutShown, cutTemplate);
    const base = runPlaces(shown).find((p) => p.unit.kind === 'base');
    check(
      'S01.1 отметки «Размеров» (цоколь 150, боковина 760, столешница 30, фартук 600, глубины 450/250/350) доезжают до ПРАВЛЕНОГО ряда стены А: место, высота и глубина каждого модуля и детали раскроя — как у того же ряда без правки',
      geometry.length === 0 && cut.length === 0 && base !== undefined && Math.round(base.depthM * MM) === 450 && Math.round(base.y * MM) === 150,
      geometry.length || cut.length
        ? `сцена: ${geometry.slice(0, 3).join('; ')} · раскрой: ${cut.slice(0, 2).join('; ')}`
        : `модулей ${shapeOf(shown).size}, деталей по ${cutShown.size} модулям — совпали; нижний: глубина ${Math.round((base?.depthM ?? 0) * MM)}, низ ${Math.round((base?.y ?? 0) * MM)}`,
    );

    const fronts = frontsVsCarcass(shown);
    check(
      'S01.2 у правленого ряда после смены боковины фронты ящиков закрывают корпус (сумма = высота, ловушка 83)',
      fronts.checked > 0 && fronts.bad.length === 0,
      fronts.checked === 0 ? 'НУЛЕВОЙ СЕЛЕКТОР: модулей с ящиками в ряду нет' : fronts.bad.join('; ') || `модулей с ящиками ${fronts.checked}`,
    );
  }

  /* ═══ 2. Потолок замера доезжает до правленого ряда ═══ */
  {
    const before = kitchenInput(DEFAULT_PRODUCTION);
    const edit = editedOnce(shownOf(before, {}).run, DEMO_REQUIREMENTS, before.openings);
    const higher: Measurement = { ...DEMO_MEASUREMENT, ceilingHeightMm: DEMO_MEASUREMENT.ceilingHeightMm + 200 };
    const after = kitchenInput(DEFAULT_PRODUCTION, higher);
    const template = shownOf(after, {}).run;
    const shown = shownOf(after, { optimal: edit.run }).run;
    const geometry = drift(shapeOf(shown), shapeOf(template));
    check(
      `S01.3 потолок замера ${DEMO_MEASUREMENT.ceilingHeightMm} → ${higher.ceilingHeightMm} мм доезжает до правленого ряда: потолок ряда и каждый модуль — как у ряда без правки`,
      shown.ceilingHeightMm === higher.ceilingHeightMm && geometry.length === 0,
      `потолок ряда ${shown.ceilingHeightMm} · ${geometry.slice(0, 3).join('; ') || 'модули совпали'}`,
    );
  }

  /* ═══ 3. Школа цеха организации — вторая школа (550/350 и 600/300) ═══ */
  for (const [title, school] of SCHOOLS) {
    const before = kitchenInput(DEFAULT_PRODUCTION);
    const edit = editedOnce(shownOf(before, {}).run, DEMO_REQUIREMENTS, before.openings);
    const after = kitchenInput(school);
    const template = shownOf(after, {}).run;
    const shown = shownOf(after, { optimal: edit.run }).run;
    const geometry = drift(shapeOf(shown), shapeOf(template));
    const cutShown = cutOf(shown);
    const cutTemplate = cutOf(template);
    cutShown.delete(edit.moduleId);
    cutTemplate.delete(edit.moduleId);
    const cut = drift(cutShown, cutTemplate);
    check(
      `S01.4 ${title}: правленый ряд, собранный на школе по умолчанию, открыт у этого цеха — сцена и раскрой как у ряда без правки`,
      geometry.length === 0 && cut.length === 0,
      `сцена: ${geometry.slice(0, 2).join('; ') || 'совпала'} · раскрой: ${cut.slice(0, 2).join('; ') || 'совпал'}`,
    );
  }

  /* ═══ 4. Соседние стены угловой и П-образной кухни: правленые стены Б и В ═══ */
  {
    /*
     * Только высоты: глубина нижнего меняет место, которое занимает угол, а с
     * ним полезную длину соседней стены — это расхождение длины, его называет
     * `wallMismatches` («Пересобрать стену»), и модули поштучно не сверить.
     */
    const own = marks([
      ['plinthMm', 150],
      ['carcassMm', 760],
      ['apronMm', 600],
    ]);
    const production = productionFor(undefined, own);
    const report: string[] = [];
    let walls = 0;
    let ok = true;
    for (const [kind, wallIds] of [['corner_l', ['b']], ['u_shape', ['b', 'c']]] as [CompositionKind, string[]][]) {
      const first = cornerScreen(DEFAULT_PRODUCTION, {}, kind);
      let editedWalls: Record<string, Run> = {};
      wallIds.forEach((wallId, i) => {
        const wall = first.segments[i + 1];
        if (!wall) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: у кухни ${kind} нет стены ${wallId}`);
        editedWalls = withWallEdit(editedWalls, wallId, i + 1, editedOnce(wall, DEMO_REQUIREMENTS, []).run);
      });
      const template = cornerScreen(production, {}, kind).segments;
      const shown = cornerScreen(production, editedWalls, kind).segments;
      wallIds.forEach((wallId, i) => {
        walls += 1;
        const geometry = drift(shapeOf(shown[i + 1]), shapeOf(template[i + 1]));
        if (geometry.length > 0 || shown[i + 1].production?.heights.plinthMm !== 150) {
          ok = false;
          report.push(`${kind} стена ${wallId}: ${geometry.slice(0, 2).join('; ') || `цоколь ${shown[i + 1].production?.heights.plinthMm}`}`);
        } else report.push(`${kind} ${wallId}: ${shapeOf(shown[i + 1]).size} мод.`);
      });
    }
    check(
      'S01.5 угловая и П-образная кухня: правленые стены Б (и В) получают отметки объекта (цоколь 150, боковина 760, фартук 600) — модули как у тех же стен без правки',
      ok && walls === 3,
      `стен ${walls} · ${report.join(' · ')}`,
    );
  }

  /* ═══ 5. Наполнение, пересчитанное правкой, — по высоте корпуса ЭТОГО ряда ═══ */
  for (const [title, school] of SCHOOLS) {
    const input = kitchenInput(school);
    let edited: Partial<Record<VariantKey, Run>> = {};
    const shown = () => shownOf(input, edited).run;
    const target = shown().modules.find((unit) => unit.kind === 'base' && !unit.appliance && !unit.column);
    if (!target) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: обычного нижнего модуля нет');
    const results: string[] = [];
    let ok = true;
    for (const count of [3, 4]) {
      edited = {
        optimal: applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_fronts', moduleId: target.id, drawerCount: count }], openings: input.openings }),
      };
      const fronts = frontsVsCarcass(shown());
      const unit = shown().modules.find((m) => m.id === target.id);
      const drawers = unit?.fill?.drawerHeights.length ?? 0;
      ok = ok && drawers === count && fronts.bad.length === 0;
      results.push(`${count} ящ.: ${drawers === count ? '' : `ящиков ${drawers} · `}${fronts.bad.join('; ') || 'фронты = корпус'}`);
    }
    check(
      `S01.6 ${title}: «Фасад: 3 и 4 ящика» на пути экрана — сумма фронтов равна высоте корпуса этого цеха`,
      ok,
      results.join(' · '),
    );
  }

  /* ═══ 6. Антресоль в шкафу спальни и в прихожей ═══ */
  for (const zone of ['bedroom', 'hallway'] as ZoneKind[]) {
    const own = marks([
      ['baseMm', 600],
      ['mezzanineMm', 400],
    ]);
    const { input, requirements } = sectionInput(zone, productionFor(undefined, own));
    let edited: Partial<Record<VariantKey, Run>> = {};
    const shown = () => shownOf(input as ReturnType<typeof kitchenInput>, edited).run;
    const before = shown();
    const tallBefore = runPlaces(before).filter((p) => p.unit.section && p.unit.section !== 'mezzanine');
    const next = applyOps({ run: before, requirements, ops: [{ op: 'set_mezzanine', heightMm: 400 }], openings: input.openings });
    edited = { optimal: next };
    const after = shown();
    const places = runPlaces(after);
    const band = places.filter((p) => p.unit.section === 'mezzanine');
    const bandWidth = band.reduce((total, p) => total + p.unit.widthMm, 0);
    const bandIds = new Set(band.map((p) => p.unit.id));
    const bandParts = buildPanels({ run: after }).filter((panel) => bandIds.has(panel.moduleId));
    const tall = places.filter((p) => p.unit.section && p.unit.section !== 'mezzanine' && Math.round((p.y + p.heightM) * MM) > 1500);
    const ceiling = after.ceilingHeightMm;
    const seams = band.every((m) => Math.round((m.y + m.heightM) * MM) <= ceiling) && tall.every((t) => band.some((m) => Math.abs(Math.round(m.y * MM) - Math.round((t.y + t.heightM) * MM)) <= 0));
    check(
      `S01.7 ${zone}: «Добавить антресоль» 400 мм — модули антресоли стоят над шкафом во всю длину ряда (сцена и раскрой), шкаф под ней ниже ровно на неё, её глубина — своя отметка 400 при глубине шкафа 600`,
      band.length > 0 &&
        bandWidth === after.lengthMm &&
        band.every((m) => Math.round(m.heightM * MM) === 400 && Math.round(m.depthM * MM) === 400) &&
        tall.length > 0 &&
        tall.every((t) => Math.round(t.depthM * MM) === 600) &&
        seams &&
        bandParts.length > 0,
      `модулей антресоли ${band.length}, их ширина ${bandWidth} из ${after.lengthMm} · высоты ${Array.from(new Set(band.map((m) => Math.round(m.heightM * MM)))).join(',') || '—'} · глубины антресоли ${Array.from(new Set(band.map((m) => Math.round(m.depthM * MM)))).join(',') || '—'}, шкафа ${Array.from(new Set(tall.map((t) => Math.round(t.depthM * MM)))).join(',')} · шкаф до ${tallBefore.map((t) => Math.round(t.heightM * MM))[0]} → ${tall.map((t) => Math.round(t.heightM * MM))[0]} · стык ${seams ? 'вплотную' : 'РАЗОШЁЛСЯ'} · деталей антресоли ${bandParts.length} · предупреждения ${JSON.stringify(next.warnings)}`,
    );
  }

  /* ═══ 7. Где антресоли не бывает — отказ словами, а не скрытое состояние ═══ */
  for (const zone of ['living', 'bathroom'] as ZoneKind[]) {
    const { input, requirements } = sectionInput(zone, DEFAULT_PRODUCTION);
    const before = shownOf(input as ReturnType<typeof kitchenInput>, {}).run;
    const next = applyOps({ run: before, requirements, ops: [{ op: 'set_mezzanine', heightMm: 400 }], openings: input.openings });
    check(
      `S01.8 ${zone}: антресоли в профиле зоны нет — «Добавить антресоль» отказывает словами, состояние не пишется, ряд прежний`,
      next.mezzanine === undefined && /антресол/i.test(next.warnings[0] ?? '') && next.fingerprint === before.fingerprint,
      `run.mezzanine ${JSON.stringify(next.mezzanine ?? null)} · «${next.warnings[0] ?? 'МОЛЧА'}»`,
    );
  }

  /* ═══ 8. Кухня: глубина антресоли независима и на правленом ряду ═══ */
  {
    const before = kitchenInput(DEFAULT_PRODUCTION);
    const edit = editedOnce(shownOf(before, {}).run, DEMO_REQUIREMENTS, before.openings);
    const own = marks([
      ['baseMm', 600],
      ['mezzanineMm', 400],
    ]);
    const after = kitchenInput(productionFor(undefined, own));
    const withMezz = applyOps({ run: shownOf(after, { optimal: edit.run }).run, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_mezzanine', heightMm: 400 }], openings: after.openings });
    const shown = shownOf(after, { optimal: withMezz }).run;
    const places = runPlaces(shown);
    const mezz = places.filter((p) => p.unit.section === 'mezzanine');
    const base = places.filter((p) => p.unit.kind === 'base');
    check(
      'S01.9 кухня, правленый ряд: «Глубина антресоли» 400 и «Глубина нижнего» 600 — антресоль 400, нижние 600; одна отметка не трогает другую',
      mezz.length > 0 && base.length > 0 && mezz.every((m) => Math.round(m.depthM * MM) === 400) && base.every((b) => Math.round(b.depthM * MM) === 600),
      `антресоль ${Array.from(new Set(mezz.map((m) => Math.round(m.depthM * MM)))).join(',') || 'НЕТ'} · нижние ${Array.from(new Set(base.map((b) => Math.round(b.depthM * MM)))).join(',')}`,
    );
  }

  /* ═══ 8б. Спальня: поле глубины показывает ту глубину, по которой стоит шкаф ═══ */
  {
    const zone: ZoneKind = 'bedroom';
    const org = SCHOOLS[0][1];
    const plainProduction = productionFor(org, undefined);
    const ownProduction = productionFor(org, marks([['baseMm', 450]]));
    const shownPlain = markShownMm(markOf('baseMm'), plainProduction, zone);
    const shownOwn = markShownMm(markOf('baseMm'), ownProduction, zone);
    const { input } = sectionInput(zone, ownProduction);
    const run = shownOf(input as ReturnType<typeof kitchenInput>, {}).run;
    const depths = Array.from(new Set(runPlaces(run).map((p) => Math.round(p.depthM * MM))));
    const fields = marksOfZone(zone).map((mark) => mark.key);
    check(
      'S01.11 спальня: без своей отметки поле «Глубина нижнего» — глубина шкафа зоны 600, а не кухонная школа цеха 550; своя 450 — шкаф 450 и в поле 450; столешницы, фартука и боковины в форме спальни нет',
      shownPlain === 600 &&
        shownOwn === 450 &&
        depths.length === 1 &&
        depths[0] === 450 &&
        !fields.includes('countertopMm') &&
        !fields.includes('apronMm') &&
        !fields.includes('carcassMm') &&
        fields.includes('baseMm') &&
        fields.includes('mezzanineMm'),
      `поле без своей ${shownPlain}, со своей ${shownOwn} · глубины шкафа ${depths.join(',')} · поля [${fields.join(', ')}]`,
    );
  }

  /* ═══ 8в. Наполнение правленого модуля на новой высоте: подгонка или потеря словами ═══ */
  {
    const before = kitchenInput(DEFAULT_PRODUCTION);
    const plain = shownOf(before, {}).run;
    const target = plain.modules.find((unit) => unit.kind === 'base' && !unit.appliance && !unit.column);
    if (!target) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: обычного нижнего модуля нет');
    const fourDrawers = applyOps({ run: plain, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_fronts', moduleId: target.id, drawerCount: 4 }], openings: before.openings });
    const four = fourDrawers.modules.find((unit) => unit.id === target.id)!;
    /* Своя раскладка — как граница, протянутая на чертеже: сумма та же, 720. */
    const custom = applyOps({
      run: fourDrawers,
      requirements: DEMO_REQUIREMENTS,
      ops: [{ op: 'set_fill', moduleId: target.id, fill: { ...four.fill!, drawerHeights: [140, 140, 140, 300] } }],
      openings: before.openings,
    });
    const customFronts = custom.modules.find((unit) => unit.id === target.id)?.fill?.drawerHeights.join('/') ?? '';
    if (customFronts !== '140/140/140/300') throw new Error(`своя раскладка ящиков не легла: ${customFronts} — ${custom.warnings.join(' | ')}`);

    const at = (carcassMm: number) => productionFor(undefined, marks([['carcassMm', carcassMm]]));
    const taller = shownOf(kitchenInput(at(760)), { optimal: custom }).run;
    const tallerFronts = taller.modules.find((unit) => unit.id === target.id)?.fill?.drawerHeights.join('/');
    const lowered = contextChange([{ saved: custom, live: { production: at(500), ceilingHeightMm: custom.ceilingHeightMm } }]);
    const external = contextMismatches({
      count: 1,
      saved: () => custom,
      live: () => ({ production: at(500), ceilingHeightMm: custom.ceilingHeightMm }),
    });
    check(
      'S01.12 своя раскладка ящиков 140/140/140/300 правленого модуля: боковина 760 — верхние на месте, разница в нижний (140/140/140/340); боковина 500 — нижнему не хватает, отметка отказывает словами до записи, а смена школы цеха вне экрана — блокирующее расхождение «Цены нет»',
      tallerFronts === '140/140/140/340' &&
        lowered.losses.length === 1 &&
        /не встают в корпус 500/.test(lowered.losses[0].words) &&
        external.length === 1 &&
        /Цены нет/.test(mismatchPriceText(external[0])) &&
        /Пересоберите стену|пересоберите стену/.test(wallMismatchMessage(external[0])),
      `760: ${tallerFronts} · 500: «${lowered.losses[0]?.words ?? 'ПОТЕРИ НЕТ'}» · экран: «${external[0] ? mismatchPriceText(external[0]) : 'РАСХОЖДЕНИЯ НЕТ'}»`,
    );
  }

  /* ═══ 9. Сохранить → открыть: тот же ряд у экрана и у кабинета клиента ═══ */
  {
    const before = kitchenInput(DEFAULT_PRODUCTION);
    const edit = editedOnce(shownOf(before, {}).run, DEMO_REQUIREMENTS, before.openings);
    const own = marks([
      ['baseMm', 480],
      ['plinthMm', 120],
    ]);
    const state: MillworkState = JSON.parse(
      JSON.stringify({ requirements: DEMO_REQUIREMENTS, production: own, runs: { optimal: edit.run }, selectedVariant: 'optimal' }),
    );
    const offer = projectOffer({ title: 'Проверка', zone: DEMO_ZONE, measurement: DEMO_MEASUREMENT, state, catalog: [], rates: DEMO_RATES });
    if (offer.state !== 'built') throw new Error(`кабинет не собрался: ${offer.refusal}`);
    const screen = shownOf(kitchenInput(productionFor(undefined, own)), { optimal: state.runs!.optimal! }).run;
    const geometry = drift(shapeOf(offer.run), shapeOf(screen));
    const base = runPlaces(offer.run).find((p) => p.unit.kind === 'base');
    check(
      'S01.10 сохранили правленый объект с отметками (глубина 480, цоколь 120), открыли: кабинет клиента и экран видят один ряд, и он на этих отметках',
      geometry.length === 0 && base !== undefined && Math.round(base.depthM * MM) === 480 && Math.round(base.y * MM) === 120,
      `${geometry.slice(0, 2).join('; ') || 'ряды совпали'} · нижний ${Math.round((base?.depthM ?? 0) * MM)} на ${Math.round((base?.y ?? 0) * MM)}`,
    );
  }

  /* ═══ 11. Развёртка зоны из секций стоит по `runPlaces`, как сцена ═══ */
  {
    /** Отметки модулей так, как их нарисовал чертёж: `data-bottom-mm` и `data-top-mm`. */
    const drawn = (run: Run): Map<string, string> => {
      const svg = renderToStaticMarkup(createElement(ElevationDrawing, { run, mode: 'fronts' }));
      const out = new Map<string, string>();
      for (const tag of svg.match(/<g [^>]*data-module-id="[^"]+"[^>]*>/g) ?? []) {
        const id = /data-module-id="([^"]+)"/.exec(tag)![1];
        const bottom = /data-bottom-mm="(-?\d+)"/.exec(tag)?.[1];
        const top = /data-top-mm="(-?\d+)"/.exec(tag)?.[1];
        out.set(id, `${bottom ?? '?'}…${top ?? '?'}`);
      }
      return out;
    };
    const placed = (run: Run): Map<string, string> =>
      new Map(runPlaces(run).map((p) => [p.unit.id, `${Math.round(p.y * MM)}…${Math.round((p.y + p.heightM) * MM)}`]));
    const report: string[] = [];
    const bad: string[] = [];
    let cases = 0;
    let modulesChecked = 0;
    const cover = (title: string, run: Run) => {
      cases += 1;
      const want = placed(run);
      const got = drawn(run);
      modulesChecked += want.size;
      const diff = drift(got, want);
      if (want.size === 0) bad.push(`${title}: модулей нет — сверять нечего`);
      if (diff.length > 0) bad.push(`${title}: ${diff.slice(0, 3).join('; ')}`);
      return got;
    };
    for (const zone of ['bedroom', 'hallway', 'living', 'bathroom'] as ZoneKind[]) {
      const { requirements, input } = sectionInput(zone, DEFAULT_PRODUCTION);
      const plain = composeVariants(input, DISABLED, {}).find((v) => v.key === 'optimal')!.run;
      cover(`${zone} без антресоли`, plain);
      if (zone === 'bedroom' || zone === 'hallway') {
        for (const heightMm of [DEFAULT_MEZZANINE_MM, 700]) {
          const edited = applyOps({ run: plain, requirements, ops: [{ op: 'set_mezzanine', heightMm }], openings: input.openings });
          if (edited.warnings.length > 0) throw new Error(`${zone}: антресоль ${heightMm} — отказ: ${edited.warnings.join(' | ')}`);
          const shown = composeVariants(input, DISABLED, { optimal: edited }).find((v) => v.key === 'optimal')!.run;
          const got = cover(`${zone}, антресоль ${heightMm}`, shown);
          /* Шкаф под антресолью кончается там, где она начинается: сквозь неё он не идёт. */
          const band = runPlaces(shown).filter((p) => p.unit.section === 'mezzanine');
          const bandBottom = Math.min(...band.map((p) => Math.round(p.y * MM)));
          const through = runPlaces(shown)
            .filter((p) => p.unit.section !== 'mezzanine')
            .filter((p) => Number(got.get(p.unit.id)?.split('…')[1]) > bandBottom);
          if (band.length === 0) bad.push(`${zone}, антресоль ${heightMm}: полосы нет`);
          if (through.length > 0) bad.push(`${zone}, антресоль ${heightMm}: сквозь полосу (низ ${bandBottom}) — ${through.map((p) => `${p.unit.id} ${got.get(p.unit.id)}`).join(', ')}`);
          report.push(`${zone} ${heightMm}: полоса ${bandBottom}…, шкаф до ${Math.max(...runPlaces(shown).filter((p) => p.unit.section !== 'mezzanine').map((p) => Math.round((p.y + p.heightM) * MM)))}`);
        }
      }
    }
    check(
      'S01.14 развёртка зон из секций (спальня, прихожая, зал, санузел; антресоль 500 и 700) рисует каждый модуль на отметках `runPlaces`, как сцена; шкаф под антресолью не идёт сквозь неё',
      cases === 8 && modulesChecked > 0 && bad.length === 0,
      `случаев ${cases}, модулей ${modulesChecked} · ${bad.slice(0, 3).join(' | ') || report.join(' · ')}`,
    );
  }

  /* ═══ 10. Сужение по шаблону: хвост уже самого узкого корпуса — доборная планка ═══ */
  {
    const bad: string[] = [];
    let narrowed = 0;
    let fillers = 0;
    let boundary = '';
    for (const [school, production] of [['умолчания', productionFor(undefined, undefined)] as [string, ProductionSettings], ...SCHOOLS]) {
      const input = kitchenInput(production);
      const plain = shownOf(input, {}).run;
      const target = plain.modules.find((unit) => unit.kind === 'base' && !unit.appliance && !unit.column);
      if (!target) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ${school} — в ряду нет обычного нижнего модуля`);
      for (const delta of [50, 100, 140, MIN_WIDTH]) {
        const edited = applyOps({ run: plain, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_width', moduleId: target.id, widthMm: target.widthMm - delta }], openings: input.openings });
        if (edited.warnings.length > 0) throw new Error(`${school}, сужение на ${delta}: движок отказал — ${edited.warnings.join(' | ')}`);
        const shown = shownOf(input, { optimal: edited }).run;
        narrowed += 1;
        const tail = shown.modules.find((unit) => unit.offsetMm + unit.widthMm === shown.lengthMm);
        const narrow = shown.modules.filter((unit) => unit.kind !== 'filler' && unit.widthMm < MIN_WIDTH);
        const tailPanels = tail ? buildPanels({ run: shown }).filter((panel) => panel.moduleId === tail.id) : [];
        const where = `${school}, −${delta}`;
        if (narrow.length > 0) bad.push(`${where}: корпус уже ${MIN_WIDTH} — ${narrow.map((u) => `${u.id} «${u.label}» ${u.widthMm}`).join(', ')}`);
        if (delta < MIN_WIDTH) {
          if (!tail || tail.kind !== 'filler' || tail.widthMm !== delta || tail.doorCount !== 0) {
            bad.push(`${where}: хвост ${tail ? `${tail.id} ${tail.kind} «${tail.label}» ${tail.widthMm}` : 'НЕТ'}`);
          } else if (tailPanels.length !== 1 || tailPanels[0].name !== 'Доборная планка') {
            bad.push(`${where}: в раскрое у хвоста ${tailPanels.map((p) => `${p.name} ${p.lengthMm}×${p.widthMm}`).join(', ') || 'ничего'}`);
          } else fillers += 1;
        } else if (school === 'умолчания') {
          boundary = tail ? `${tail.kind} «${tail.label}» ${tail.widthMm}` : 'НЕТ';
          if (!tail || tail.kind !== 'base' || tail.widthMm !== MIN_WIDTH) bad.push(`${where}: на границе ждали корпус ${MIN_WIDTH}, стоит ${boundary}`);
        }
      }
    }
    check(
      `S01.13 сужение модуля по шаблону на 50/100/140 мм (три школы цеха): хвост у стены — доборная планка той же ширины, одна деталь «Доборная планка» в раскрое, корпусов уже ${MIN_WIDTH} мм нет; на ${MIN_WIDTH} — обычный корпус`,
      narrowed === 12 && fillers === 9 && bad.length === 0,
      `сужений ${narrowed}, планок ${fillers}, граница: ${boundary} · ${bad.slice(0, 3).join(' | ')}`,
    );
  }
}

/* Отдельный запуск: тот же набор, свой счёт. */
if (require.main === module) {
  let passed = 0;
  let failed = 0;
  stage01Checks((name, condition, detail = '') => {
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

export type { Module };
