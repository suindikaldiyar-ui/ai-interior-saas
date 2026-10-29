/**
 * ОБЪЕКТЫ И ОЖИДАНИЯ БРАУЗЕРНОЙ ПРИЁМКИ ТВ-ЗОНЫ (`check-tvzone.mjs`) — тем же
 * путём экрана, что `verify-tvzone.ts`: замер стены 3800 → шаблон варианта →
 * `workspaceInput` → `objectInput` → `composeVariants` → правка `applyOps`, как
 * `runOps`. Кнопки блока «ТВ-зона» — те же `suggestTv` и `suggestPanel`, что под
 * ними в Studio.
 *
 *   A, B, C — варианты на стене 3800: модули, телевизор (`tvRect`, `tvBoxMm`),
 *             детали панели, строки сметы, открываемые детали; у A — что дадут
 *             «65″», «← 50» и «+ Рейки»; у C — точки стены над панелью для
 *             замера светлоты ореола ленты за панелью;
 *   living  — гостиная по прежнему шаблону зоны (без ТВ-зоны): та же стена —
 *             для замера нагрузки рядом с C.
 *
 * Выход — JSON в stdout. Отказ движка там, где его не ждали, — падение.
 */
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { openablePartIds, runBoxes, runBoxesByModule } from '../lib/millwork/cabinetBoxes';
import { runPlacements } from '../lib/millwork/composition';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { TV_MOUNT_MM, slatLayout, suggestPanel, tvBoxMm, tvFromDiagonal, tvRect, tvZoneFitRefusal, wallPanelParts } from '../lib/millwork/tvZone';
import { rowStandardDepthMm } from '../lib/millwork/fill';
import { vitrineOf } from '../lib/millwork/vitrine';
import { surveyFromMeasurement, type Survey } from '../types/survey';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { Measurement, MillworkOp, Run, RunRequirements, TvZoneVariant, VariantKey } from '../types/millwork';

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const SHOP = DEFAULT_PRODUCTION;
const L = 3800;

/** Замер как замеренный: приёмка не про допущения (тот же приём, что у `radius-browser-fixture`). */
function measuredSurvey(measurement: Measurement): Survey {
  const survey = surveyFromMeasurement(measurement, 'TV', 'TV', '2026-10-28');
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
      openings: wall.openings.map((o) => ({ ...o, fromCornerMm: known(o.fromCornerMm), widthMm: known(o.widthMm), heightMm: known(o.heightMm), sillMm: known(o.sillMm) })),
    })),
    comms: survey.comms.map((c) => ({ ...c, fromCornerMm: known(c.fromCornerMm), heightMm: known(c.heightMm) })),
    steps: { ceiling: 'done', walls: 'done', openings: 'done', comms: 'done', photos: 'todo' },
  };
}

/**
 * Стена зала заданной длины без проёмов; остальные стены — как в демо. Точек коммуникаций кухни (вода,
 * вентканал, розетки под технику) в зале нет: вентканал на 3000 мм не дал бы и укоротить стену до 2400.
 */
const wallOf = (lengthMm: number): Measurement => ({
  ...DEMO_MEASUREMENT,
  id: `tv-wall-${lengthMm}`,
  walls: DEMO_MEASUREMENT.walls.map((wall, i) => (i === 0 ? { ...wall, lengthMm, openings: [] } : wall)),
  comms: [],
});
const WALL = wallOf(L);

function screen(requirements: RunRequirements, measurement: Measurement = WALL) {
  const base = workspaceInput({ title: 'TV', zone: 'Гостиная', measurement, requirements, rates: DEMO_RATES, cornerAt: null, wallId: 'w1' });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production: SHOP, milling: new Map(), carcass: new Map(), materials: new Map() });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings });
    if (next.warnings.length > 0) throw new Error(`движок отказал: ${next.warnings.join(' | ')}`);
    edited = { optimal: next };
    return shown();
  };
  /* Правка, которой ждут отказ: первая строка отказа — та, что `runOps` кладёт под блок. Ряд не меняется. */
  const refused = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings });
    if (next.warnings.length === 0) throw new Error(`ждали отказа, а движок принял: ${JSON.stringify(list)}`);
    return next.warnings[0];
  };
  return { shown, ops, refused };
}

const qty = (estimate: { lines: { key: string; quantity: number }[] }, key: string) =>
  Math.round(estimate.lines.filter((line) => line.key === key).reduce((sum, line) => sum + line.quantity, 0) * 1000) / 1000;
const decorParts = (run: Run) => runBoxes(run, { thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm }).filter((box) => box.decor).length;
/** Детали по контуру и гнутые в сцене — тем же `runBoxesByModule`, что у `Cabinet3D` (как в `radius-browser-fixture`). */
const shapedParts = (run: Run) =>
  runBoxesByModule(run, { production: SHOP, thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm }).modules.reduce(
    (sum, entry) => sum + entry.boxes.filter((box) => box.shape).length,
    0,
  );

/** Точка ряда (мм: вдоль, от пола, от фасадов назад — минус) в мире, мм: то же место, что ставит сцена (`runPlacements`). */
function world(run: Run, [u, v, z]: [number, number, number]): [number, number, number] {
  const place = runPlacements({ runs: [run], zone: run.zone, production: SHOP })[0];
  const a = (place.rotationYDeg * Math.PI) / 180;
  const x = u / 1000;
  const zm = z / 1000;
  return [Math.round((x * Math.cos(a) + zm * Math.sin(a) + place.xM) * 1000), Math.round(v), Math.round((-x * Math.sin(a) + zm * Math.cos(a) + place.zM) * 1000)];
}

/**
 * Коробка ряда в мире, мм [minX, minY, minZ, maxX, maxY, maxZ]: `u` вдоль ряда, `v` от пола, `w` от стены
 * в комнату — восемь углов через место ряда, как у зонда сцены.
 */
function worldBox(run: Run, u: [number, number], v: [number, number], w: [number, number]): number[] {
  const wallZ = -rowStandardDepthMm(run.zone, 'base', run.production);
  const out = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const x of u) for (const y of v) for (const z of w) {
    const p = world(run, [x, y, wallZ + z]);
    for (let k = 0; k < 3; k += 1) {
      out[k] = Math.min(out[k], p[k]);
      out[k + 3] = Math.max(out[k + 3], p[k]);
    }
  }
  return out;
}
const union = (boxes: number[][]) =>
  boxes.length === 0 ? null : [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[k]))).concat([3, 4, 5].map((k) => Math.max(...boxes.map((b) => b[k]))));
/** Нарисованный телевизор: корпус по `tvBoxMm` и кронштейн за ним — до стены или панели. */
const tvWorld = (run: Run) => {
  const box = tvBoxMm(run, run.tv!);
  return worldBox(run, [box.x0, box.x1], [box.y0, box.y1], [box.z0 - (run.tv!.mountMm ?? TV_MOUNT_MM), box.z1]);
};
/** Нарисованные детали панелей — их общий габарит. */
const decorWorld = (run: Run) =>
  union((run.wallPanels ?? []).flatMap((panel) => wallPanelParts(panel).map((part) => worldBox(run, [part.u0, part.u1], [part.v0, part.v1], [part.w0, part.w1]))));

const templateOf = (variant: TvZoneVariant) => {
  const found = RUN_TEMPLATES.find((t) => t.tvZone === variant);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шаблона ТВ-зоны ${variant} нет`);
  return found;
};

function variantObject(variant: TvZoneVariant) {
  const template = templateOf(variant);
  const requirements = requirementsFromTemplate(template, DEMO_REQUIREMENTS.options);
  const s = screen(requirements);
  const shown = s.shown();
  const run = shown.run;
  if (!run.tv || run.modules.length === 0) throw new Error(`вариант ${variant} на ${L}: ${run.warnings.join(' | ') || 'пусто'}`);
  const vitrines = run.modules.filter((unit) => vitrineOf(unit));
  const out: Record<string, unknown> = {
    title: `${template.name} · ${L}`,
    zone: 'Гостиная',
    measurement: WALL,
    survey: measuredSurvey(WALL),
    requirements,
    templateId: template.id,
    shape: 'linear' as const,
    expect: {
      modules: run.modules.length,
      moduleIds: run.modules.map((unit) => unit.id),
      hanging: run.modules.filter((unit) => unit.hangMm !== undefined).map((unit) => unit.id),
      tv: run.tv,
      tvRect: tvRect(run.tv),
      tvBox: tvBoxMm(run, run.tv),
      tvWorld: tvWorld(run),
      decorParts: decorParts(run),
      decorWorld: decorWorld(run),
      panels: run.wallPanels ?? [],
      slats: (run.wallPanels ?? []).reduce((n, panel) => n + slatLayout(panel).length, 0),
      openable: openablePartIds(run),
      shaped: shapedParts(run),
      vitrineDoors: openablePartIds(run).filter((id) => vitrines.some((unit) => id.startsWith(`${unit.id}:door:`))),
      lines: Object.fromEntries(
        ['cable_channel', 'decor_panel_slats', 'radius_cnc', 'glass_shelf', 'led_display', 'drawer_box', 'hanging_bracket', 'vitrine_frame_profile'].map((key) => [key, qty(shown.estimate, key)]),
      ),
      total: Math.round(shown.estimate.total),
      fingerprint: run.fingerprint,
    },
  };

  if (variant === 'A') {
    /* Стена 3800 → 2400 полем длины: готовое решение пересобирается под новую длину той же раскладкой. */
    const short = screen(requirements, wallOf(2400)).shown().run;
    if (!short.tv || short.modules.length === 0) throw new Error(`A на 2400: ${short.warnings.join(' | ') || 'пусто'}`);
    out.resize = {
      lengthMm: 2400,
      modules: short.modules.map((unit) => ({ id: unit.id, offsetMm: unit.offsetMm, widthMm: unit.widthMm })),
      tv: short.tv,
      tvWorld: tvWorld(short),
    };
    /* «65″» — диагональ правится от прежнего места; «← 50» — центр левее на 50; «+ Рейки» — `suggestPanel`. */
    const tv65 = { ...tvFromDiagonal(65, { centerMm: run.tv.centerMm, bottomMm: run.tv.bottomMm }), supply: run.tv.supply };
    const after65 = s.ops([{ op: 'set_tv', tv: tv65 }]).run;
    const nudged = s.ops([{ op: 'set_tv', tv: { ...after65.tv!, centerMm: after65.tv!.centerMm - 50 } }]).run;
    const panel = suggestPanel(nudged, 'slats', SHOP);
    if ('refusal' in panel) throw new Error(`«+ Рейки» у A: ${panel.refusal}`);
    const withPanel = s.ops([{ op: 'set_wall_panel', panel }]);
    /* «Низ от пола» подвесной тумбы 500: верх тумбы уходит выше низа телевизора — отказ движка словами. */
    const hanging = withPanel.run.modules.filter((unit) => unit.hangMm !== undefined);
    const hangRefusal = s.refused(hanging.map((unit) => ({ op: 'set_hang' as const, moduleId: unit.id, hangMm: 500 })));
    out.edit = {
      tv65: after65.tv,
      tv65Rect: tvRect(after65.tv!),
      tv65World: tvWorld(after65),
      nudged: nudged.tv,
      nudgedRect: tvRect(nudged.tv!),
      nudgedWorld: tvWorld(nudged),
      panel,
      panelParts: wallPanelParts(panel).length,
      slats: slatLayout(panel).length,
      decorParts: decorParts(withPanel.run),
      decorWorld: decorWorld(withPanel.run),
      /* На панели телевизор отходит от стены на её толщину: кронштейн крепится к панели. */
      tvOnPanel: tvBoxMm(withPanel.run, withPanel.run.tv!),
      tvOnPanelWorld: tvWorld(withPanel.run),
      decorSlatsM2: qty(withPanel.estimate, 'decor_panel_slats'),
      total: Math.round(withPanel.estimate.total),
      fingerprint: withPanel.run.fingerprint,
      hangRefusal,
      hangIds: hanging.map((unit) => unit.id),
    };
  }

  if (variant === 'B') {
    /* Дверца тумбы — первая створка модуля с дверцами; лента под тумбой — у модуля с ящиками, пол под ним. */
    const doors = run.modules.find((unit) => unit.section === 'tv_doors');
    const drawers = run.modules.find((unit) => unit.section === 'tv_drawers');
    if (!doors || !drawers) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: у B нет модуля с дверцами или ящиками');
    out.door = `${doors.id}:door:0`;
    /*
     * Цель камеры — внутри габарита мебели (сцена держит цель на мебели): низ модуля чуть выше его дна;
     * пол под ним виден снизу-спереди.
     */
    out.under = {
      moduleId: drawers.id,
      floor: world(run, [drawers.offsetMm + drawers.widthMm / 2, 0, -150]),
      target: world(run, [drawers.offsetMm + drawers.widthMm / 2, (drawers.hangMm ?? 0) + 50, -150]),
    };
  }

  if (variant === 'C') {
    /* Стена над панелью — в 60 мм над её верхом по центру: туда светит верхняя полоса ленты за панелью. */
    const panel = run.wallPanels![0];
    const wallZ = -rowStandardDepthMm(run.zone, 'base', run.production) + 2;
    const top = panel.bottomMm + panel.heightMm;
    out.door = (out.expect as { vitrineDoors: string[] }).vitrineDoors[0];
    /* Середина витрины, чья дверца открывается, — для снимка крупным планом. */
    const vitrine = run.modules.find((unit) => out.door === `${unit.id}:door:0`);
    if (!vitrine) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля дверцы ${String(out.door)} нет`);
    out.vitrineCenter = world(run, [vitrine.offsetMm + vitrine.widthMm / 2, 1000, -200]);
    out.halo = {
      above: world(run, [panel.fromMm + panel.widthMm / 2, Math.min(run.ceilingHeightMm - 30, top + 60), wallZ]),
      /* Цель камеры — внутри габарита мебели (верх панели — его верх): точка над панелью видна чуть выше середины кадра. */
      target: world(run, [panel.fromMm + panel.widthMm / 2, top - 50, wallZ]),
      panelId: panel.id,
      wallId: run.wallId ?? null,
    };
  }
  return out;
}

/* Гостиная по прежнему шаблону зоны — для замера нагрузки рядом с C. */
const livingTemplate = RUN_TEMPLATES.find((t) => t.zone === 'living' && !t.tvZone);
if (!livingTemplate) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: шаблона гостиной без ТВ-зоны нет');
const livingReq = requirementsFromTemplate(livingTemplate, DEMO_REQUIREMENTS.options);

/* C на стене 2200: короче порога (2300) — отказ раскладки словами, на экране — блокирующее и цены нет. */
const shortWall = wallOf(2200);
const cTemplate = templateOf('C');
const cShortReq = requirementsFromTemplate(cTemplate, DEMO_REQUIREMENTS.options);
const cShortRun = screen(cShortReq, shortWall).shown().run;
const cShortRefusal = tvZoneFitRefusal(cShortReq, cShortRun);
if (!cShortRefusal) throw new Error('C на 2200 собрался — ждали отказа');

process.stdout.write(
  JSON.stringify({
    A: variantObject('A'),
    B: variantObject('B'),
    C: variantObject('C'),
    Cshort: {
      title: `${cTemplate.name} · 2200`,
      zone: 'Гостиная',
      measurement: shortWall,
      survey: measuredSurvey(shortWall),
      requirements: cShortReq,
      templateId: cTemplate.id,
      shape: 'linear',
      expect: { refusal: cShortRefusal, modules: cShortRun.modules.length },
    },
    living: {
      title: `${livingTemplate.name} · ${L}`,
      zone: 'Гостиная',
      measurement: WALL,
      survey: measuredSurvey(WALL),
      requirements: livingReq,
      templateId: livingTemplate.id,
      shape: 'linear',
      expect: { modules: screen(livingReq).shown().run.modules.length },
    },
  }),
);
