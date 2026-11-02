/**
 * ОБЪЕКТЫ ДЛЯ ПРИЁМКИ ФУРНИТУРЫ В БРАУЗЕРЕ (HARDWARE-01) — путём экрана, базу не трогает.
 *
 *   kitchen  — демо-стена без окна (короб вентиляции остаётся): верхний
 *              шкаф 300 на подъёмнике, шкаф над мойкой — «Сушилка», нижний
 *              500 — «Ящики» (три фронта). Шаблон, как у замерщика.
 *   cargo    — свободная сборка на той же стене: один модуль «Карго» 200.
 *   wardrobe — шкаф спальни 1000 (купе): отсек b1 со штангой 476 в свету,
 *              отсек b2 пустой.
 *
 * Ряды собирает тот же `composeVariants`, правит тот же `applyOps`.
 * Позиции фурнитуры здесь НЕ ставятся: их ИД — строки каталога организации,
 * и ставит их человек в Studio («Фурнитура» → «Установить»).
 *
 * Выход — JSON в stdout: `{ <ключ>: { requirements, measurement, survey, run } }`.
 * Отказ движка на любой операции — падение со словами движка.
 */
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import { surveyFromMeasurement, type Survey } from '../types/survey';
import type { Measurement, MillworkOp, ModuleFill, Run, RunRequirements } from '../types/millwork';
import type { CatalogEntryFull, ProductionSettings } from '../types/catalog';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { runnerModelOf } from '../lib/millwork/runnerModel';
import { drawerDrafts, drawerRunnerOf, moduleDrawerKits } from '../lib/millwork/drawerKit';
import { allModules } from '../lib/millwork/layout';
import { aventosLinks, aventosOf } from '../lib/millwork/aventos';
import { liftChoices } from '../lib/millwork/liftChoice';
import { ceilingStack, topFillerSpans } from '../lib/millwork/topFiller';

type Fixture = { requirements: RunRequirements; measurement: Measurement; survey: Survey; run: Run };

/** Замер как замеренный: приёмка не про допущения. */
function measuredSurvey(measurement: Measurement): Survey {
  const survey = surveyFromMeasurement(measurement, 'HARDWARE-01', 'HARDWARE-01', '2026-10-21');
  const known = <T,>(value: unknown): T => {
    const v = value as { state?: string; value?: unknown };
    return (v && v.state === 'assumed' ? { state: 'measured', value: v.value } : value) as T;
  };
  return {
    ...survey,
    ceilingHeightMm: known(survey.ceilingHeightMm),
    walls: survey.walls.map((wall) => ({
      ...wall,
      lengthMm: known(wall.lengthMm),
      openings: wall.openings.map((o) => ({
        ...o,
        fromCornerMm: known(o.fromCornerMm),
        widthMm: known(o.widthMm),
        heightMm: known(o.heightMm),
        sillMm: known(o.sillMm),
      })),
    })),
    comms: survey.comms.map((c) => ({ ...c, fromCornerMm: known(c.fromCornerMm), heightMm: known(c.heightMm) })),
    steps: { ceiling: 'done', walls: 'done', openings: 'done', comms: 'done', photos: 'todo' },
  };
}

function screen(title: string, zone: string, measurement: Measurement, requirements: RunRequirements) {
  const input = workspaceInput({
    title,
    zone,
    measurement,
    requirements,
    rates: DEMO_RATES,
    wallId: 'w1',
    cornerAt: null,
    production: DEFAULT_PRODUCTION,
  } as never);
  let edited: Run | null = null;
  const shown = (): Run =>
    composeVariants(input, { basic: [], optimal: [], premium: [] } as never, (edited ? { optimal: edited } : {}) as never).find(
      (v: { key: string }) => v.key === 'optimal',
    )!.run as Run;
  const apply = (ops: MillworkOp[]): Run => {
    const next = applyOps({ run: shown(), requirements, ops, openings: input.openings, roomDepthMm: 0 });
    if (next.warnings.length) throw new Error(`${title}: движок отказал: ${next.warnings.join(' | ')}`);
    edited = next;
    return shown();
  };
  return { shown, apply };
}

/* ── kitchen: стена демо без окна ── */
const noWindow: Measurement = {
  ...DEMO_MEASUREMENT,
  id: 'hw-kitchen',
  walls: DEMO_MEASUREMENT.walls.map((wall) => ({ ...wall, openings: wall.openings.filter((o) => o.kind !== 'window') })),
};
const k = screen('HW kitchen', 'Кухня', noWindow, DEMO_REQUIREMENTS);
const k0 = k.shown();
const sink = k0.modules.find((m) => m.appliance?.startsWith('sink'));
if (!sink) throw new Error('kitchen: мойки в ряду нет');
const sinkMid = sink.offsetMm + sink.widthMm / 2;
const overSink = k0.upperSegments
  .flatMap((segment) => segment.modules)
  .find((u) => u.offsetMm <= sinkMid && u.offsetMm + u.widthMm >= sinkMid && u.section !== 'mezzanine');
if (!overSink) throw new Error('kitchen: над мойкой нет верхнего шкафа');
const lifted = k0.upperSegments.flatMap((segment) => segment.modules).find((u) => u.id === 'upper-1200@w1');
if (!lifted) throw new Error('kitchen: верхнего шкафа upper-1200@w1 нет');
const drawers = k0.modules.find((m) => m.id === 'base-3300@w1');
if (!drawers) throw new Error('kitchen: нижнего base-3300@w1 нет');
k.apply([{ op: 'set_opening', moduleId: lifted.id, opening: 'lift' }]);
k.apply([{ op: 'set_variant', moduleId: overSink.id, variant: 'upper_dryer' }]);
k.apply([{ op: 'set_variant', moduleId: drawers.id, variant: 'drawers' }]);
const kitchen: Fixture = { requirements: DEMO_REQUIREMENTS, measurement: noWindow, survey: measuredSurvey(noWindow), run: k.shown() };

/* ── cargo: свободная сборка, один модуль «Карго» 200 ── */
const FREE: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [] };
const c = screen('HW cargo', 'Кухня', noWindow, FREE);
c.apply([{ op: 'add_module', kind: 'base', widthMm: 200, variant: 'cargo' }]);
const cargo: Fixture = { requirements: FREE, measurement: noWindow, survey: measuredSurvey(noWindow), run: c.shown() };

/* ── wardrobe: шкаф-купе спальни 1000, отсеки b1 (штанга) и b2 (пусто) ── */
const W_REQ: RunRequirements = { ...DEMO_REQUIREMENTS, zone: 'bedroom', mode: 'free', appliances: [], sections: [] };
const wMeasurement: Measurement = {
  id: 'hw-wardrobe',
  ceilingHeightMm: 2500,
  walls: [3000, 2800, 3000, 2800].map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
  comms: [],
  photos: [],
  measuredBy: 'HARDWARE-01',
  measuredAt: '2026-10-21',
  notes: '',
};
const w = screen('HW wardrobe', 'Спальня', wMeasurement, W_REQ);
const w0 = w.shown();
const cabinet = w0.modules.find((m) => m.section === 'shelves');
if (!cabinet) throw new Error('wardrobe: шкафа «Полки» нет');
w.apply(w0.modules.filter((m) => m.offsetMm > cabinet.offsetMm).map((m) => ({ op: 'remove_module' as const, moduleId: m.id })));
w.apply([{ op: 'set_width', moduleId: cabinet.id, widthMm: 1000 }]);
const unit = w.shown().modules.find((m) => m.id === cabinet.id);
if (!unit?.fill) throw new Error('wardrobe: у шкафа нет наполнения');
const fill = {
  ...unit.fill,
  shelves: [],
  dividerMm: 0,
  rodsMm: [],
  drawerHeights: [],
  bays: [
    { id: 'b1', widthMm: 476, shelves: { mode: 'even', count: 0 }, zones: [{ id: 'z1', rod: { belowTopMm: 60 } }] },
    { id: 'b2', shelves: { mode: 'even', count: 0 } },
  ],
} as unknown as ModuleFill;
w.apply([{ op: 'set_fill', moduleId: cabinet.id, fill }]);
const wardrobe: Fixture = { requirements: W_REQ, measurement: wMeasurement, survey: measuredSurvey(wMeasurement), run: w.shown() };

/*
 * ── drawers (HW-04): ожидания TANDEMBOX antaro на ящиках base-3300@w1 —
 * тем же движком, что экран: ходовая 576.4501M на месте направляющей,
 * царги 378M4502SA на месте царг. Каталог — строки фактов
 * (`hardwareCatalogRow`), правила короба — те же, что у организации части.
 */
const TB_RUNNER = 'MFR-BLUM-576.4501M';
const TB_SIDES = 'MFR-BLUM-378M4502SA';
const TB_MODULE = 'base-3300@w1';
const TB_RULES = { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: true } as const;
const tbShop: ProductionSettings = { ...DEFAULT_PRODUCTION, drawerBox: TB_RULES };
const tbCatalog = hardwareCatalog(
  HARDWARE_FACTS.filter((fact) => fact.article === TB_RUNNER || fact.article === TB_SIDES).map((fact) => {
    const row = hardwareCatalogRow(fact);
    return { id: `hw:${fact.article}`, article: row.article, name_ru: row.name_ru, price: row.price, unit: row.unit, meta: { hardware: fact.hardware }, is_active: true, assets: [] } as unknown as CatalogEntryFull;
  }),
);
const tbItem = (article: string) => {
  const found = tbCatalog.get(`hw:${article}`);
  if (!found) throw new Error(`drawers: позиции ${article} в фактах нет`);
  return found;
};
const tbRun = applyOps({
  run: { ...kitchen.run, production: tbShop },
  requirements: DEMO_REQUIREMENTS,
  ops: [
    { op: 'set_fitting', moduleId: TB_MODULE, slot: 'slide', itemId: tbItem(TB_RUNNER).id },
    { op: 'set_fitting', moduleId: TB_MODULE, slot: 'drawer_side', itemId: tbItem(TB_SIDES).id },
  ],
  openings: noWindow.walls[0].openings,
  hardware: tbCatalog,
});
if (tbRun.warnings.length) throw new Error(`drawers: движок отказал: ${tbRun.warnings.join(' | ')}`);
const tbUnit = allModules(tbRun).find((m) => m.id === TB_MODULE);
if (!tbUnit) throw new Error(`drawers: модуля ${TB_MODULE} нет`);
const tbKits = moduleDrawerKits(tbUnit, tbRun, tbShop, tbCatalog);
const notBox = tbKits.filter((kit) => kit.state !== 'box');
if (tbKits.length === 0 || notBox.length) throw new Error(`drawers: короба TANDEMBOX не встали: ${tbKits.length} комплектов, черновиков ${notBox.length}`);
const tbParts = tbKits.flatMap((kit) => (kit.state === 'box' ? kit.plan.parts : []));
const sizes = (name: string) =>
  tbParts
    .filter((p) => p.name === name)
    .flatMap((p) => Array.from({ length: p.qty }, () => `${p.lengthMm}x${p.widthMm}`))
    .sort();
/* Ход — тем же `drawerRunnerOf`, что кладёт его на коробки ящика сцены: по коробу (полное выдвижение, потеря 0). */
const runner = tbKits[0].state === 'box' ? drawerRunnerOf(tbKits[0], tbCatalog) : runnerModelOf(tbItem(TB_RUNNER));
const drawersExpect = {
  module: TB_MODULE,
  runner: TB_RUNNER,
  sides: TB_SIDES,
  drawers: tbKits.length,
  travelMm: runner.travelMm,
  members: runner.members,
  travelWords: runner.words,
  bottoms: sizes('Дно ящика'),
  backs: sizes('Торец ящика'),
  ldspSides: sizes('Боковина ящика').length,
  releaseWords: drawerDrafts([tbRun], tbCatalog, tbShop).reasons.filter((r) => r.includes('система ящика')),
};

/*
 * ── aventosHk, aventosHl (решение владельца 2026-11-01, п. 4): подъёмник AVENTOS на антресоли над
 * upper-1200@w1. HK top — для корпусов 205…600 (pdf 50), HL top — 300…580 (pdf 44): верхний шкаф 720 им
 * не по размеру, антресоль — высотой числом. Короб вентиляции снят (под ним антресоли нет), у HL потолок
 * 3100 — над антресолью 400 остаётся 530 мм на подъём фасада (22L3800: b = 425, pdf 46). Позиции ставит
 * человек в Studio; ожидания — тот же движок (`aventosOf`, `aventosLinks`).
 */
const aventosRoom = (id: string, ceilingHeightMm: number): Measurement => ({
  ...noWindow,
  id,
  ceilingHeightMm,
  walls: noWindow.walls.map((wall) => ({ ...wall, openings: wall.openings.filter((o) => o.kind !== 'beam') })),
});
function aventosFixture(id: string, ceilingHeightMm: number, mezzMm: number, article: string) {
  const room = aventosRoom(id, ceilingHeightMm);
  const a = screen(`HW ${id}`, 'Кухня', room, DEMO_REQUIREMENTS);
  a.apply([{ op: 'set_mezzanine', heightMm: mezzMm }]);
  const mezz = a.shown().upperSegments.flatMap((sg) => sg.modules).find((u) => u.section === 'mezzanine' && u.offsetMm === 1200);
  if (!mezz) throw new Error(`${id}: антресоли над upper-1200@w1 нет`);
  a.apply([{ op: 'set_opening', moduleId: mezz.id, opening: 'lift' }]);
  const facts = HARDWARE_FACTS.find((f) => f.article === article);
  if (!facts) throw new Error(`${id}: позиции ${article} в фактах нет`);
  const model = aventosOf({ hardware: facts.hardware } as never, mezzMm);
  if (!model) throw new Error(`${id}: у ${article} нет модели AVENTOS при корпусе ${mezzMm}`);
  const fx: Fixture = { requirements: DEMO_REQUIREMENTS, measurement: room, survey: measuredSurvey(room), run: a.shown() };
  return {
    fx,
    expect: {
      module: mezz.id,
      door: `${mezz.id}:door:0`,
      article,
      family: model.family,
      key: model.key,
      armSet: model.armSet ?? null,
      openDeg: model.openDeg,
      linksMm: aventosLinks(model, 0).map((l) => Math.hypot(l.to[0] - l.from[0], l.to[1] - l.from[1])),
    },
  };
}
const aventosHk = aventosFixture('hw-aventos-hk', 2700, 350, 'MFR-BLUM-22K2300');
const aventosHl = aventosFixture('hw-aventos-hl', 3100, 400, 'MFR-BLUM-22L2500');

/*
 * ── ceiling (задача B): антресоль до потолка — короб вентиляции снят, верхний ряд до потолка 2700 (зазор цеха 0),
 * антресоль 350 над upper-1200@w1, подъёмное открывание. Планку 100, «Подобрать подъёмник» и установку делает
 * человек в Studio; ожидания — тот же движок: ряд с планкой (`applyOps`), подбор (`liftChoices`) по фактам.
 */
const CEILING_CATALOG = hardwareCatalog(
  HARDWARE_FACTS.map((fact) => {
    const row = hardwareCatalogRow(fact);
    return { id: `hw:${fact.article}`, article: row.article, name_ru: row.name_ru, price: row.price, unit: row.unit, meta: { hardware: fact.hardware }, is_active: true, assets: [] } as unknown as CatalogEntryFull;
  }),
);
function ceilingFixture() {
  const room = aventosRoom('hw-ceiling', 2700);
  const a = screen('HW ceiling', 'Кухня', room, DEMO_REQUIREMENTS);
  a.apply([{ op: 'set_option', key: 'upperToCeiling', value: true }, { op: 'set_mezzanine', heightMm: 350 }]);
  const mezz = a.shown().upperSegments.flatMap((sg) => sg.modules).find((u) => u.section === 'mezzanine' && u.offsetMm === 1200);
  if (!mezz) throw new Error('ceiling: антресоли над upper-1200@w1 нет');
  a.apply([{ op: 'set_opening', moduleId: mezz.id, opening: 'lift' }]);
  const run0 = a.shown();
  const filled = applyOps({ run: run0, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_top_filler', heightMm: 100 }], openings: [], roomDepthMm: 0, hardware: CEILING_CATALOG });
  if (filled.warnings.length > 0) throw new Error(`ceiling: планка 100 не встала: ${filled.warnings.join(' | ')}`);
  const unitIn = (run: Run) => allModules(run).find((u) => u.id === mezz.id)!;
  const pick = liftChoices(unitIn(filled), filled, CEILING_CATALOG);
  const hk = pick.choices.find((c) => c.article === 'MFR-BLUM-22K2300');
  const limiter = hk?.changes.find((c) => c.kind === 'limiter');
  const limitOp = limiter?.ops.find((op) => op.op === 'set_fitting') as { openDeg?: number } | undefined;
  if (!hk || !limitOp?.openDeg) throw new Error('ceiling: подбор не предложил ограничитель HK top');
  const hs = pick.choices.find((c) => c.article === 'MFR-BLUM-22S2200');
  const fx: Fixture = { requirements: DEMO_REQUIREMENTS, measurement: room, survey: measuredSurvey(room), run: run0 };
  return {
    fx,
    expect: {
      module: mezz.id,
      door: `${mezz.id}:door:0`,
      stack0: ceilingStack(unitIn(run0), run0),
      stack1: ceilingStack(unitIn(filled), filled),
      article: hk.article,
      state: hk.state,
      limiterDeg: limitOp.openDeg,
      changes: hk.changes.map((c) => c.kind),
      hsState: hs?.state ?? null,
      hsWords: hs?.words ?? null,
      choices: pick.choices.length,
      spans: topFillerSpans(filled).map((s) => [s.fromMm, s.toMm]),
      openDeg: aventosOf({ hardware: HARDWARE_FACTS.find((f) => f.article === hk.article)!.hardware } as never, ceilingStack(unitIn(filled), filled).carcassMm)!.openDeg,
    },
  };
}
const ceiling = ceilingFixture();

process.stdout.write(JSON.stringify({ kitchen, cargo, wardrobe, drawersExpect, aventosHk: aventosHk.fx, aventosHkExpect: aventosHk.expect, aventosHl: aventosHl.fx, aventosHlExpect: aventosHl.expect, ceiling: ceiling.fx, ceilingExpect: ceiling.expect }));
