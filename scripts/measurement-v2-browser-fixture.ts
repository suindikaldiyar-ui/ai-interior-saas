/**
 * ОБЪЕКТЫ БРАУЗЕРНОЙ ПРИЁМКИ MEASUREMENT 2.0 (`check-measurement-v2.mjs`).
 *
 * Замер, `projects.measurements` (то, что видит форма: `resolveSurvey`),
 * состав и форма кухни — как их кладёт мастер. Ожидания — стены под мебелью
 * по часовой, тем же путём экрана (`buildFromSurvey`), что у приёмки движка.
 *
 *   L        — Г 2360 + 2540 (объект заказчика: «Стена А — 2360, Стена Б — 2540»), замер 2.0;
 *   U        — П 2800 + 3200 + 1800, замер 2.0;
 *   perimeter— вся комната 3600 × 2800 × 3600 × 2800, кухня Г у стен 1–2, замер 2.0;
 *   legacy   — прежний замер Г 2360 налево 2540 (как объект заказчика 9f33785c):
 *              свободная сборка, один модуль 600 на стене 1;
 *   kitchens — три эталонные кухни владельца (`measurement-v2-kitchens.ts`), позиции
 *              каталога — `@MAT:<артикул>`, их подставляет приёмка после загрузки коллекций;
 *   gap      — прямая 3800 «до потолка»: верх без зазора цеха и с зазором 30 мм;
 *   freeU    — свободная П 2800 + 3200 + 1800: холодильник на А, мойка на Б, шкаф на В.
 *
 * Выход — JSON в stdout. Отказ сборки там, где его не ждали, — падение.
 */
import { resolveSurvey, type Survey } from '../types/survey';
import type { CompositionKind, MillworkOp, Run, RunRequirements, SavedCornerChoice } from '../types/millwork';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import { runBoxesByModule, runPlaces } from '../lib/millwork/cabinetBoxes';
import { buildPanels } from '../lib/millwork/panels';
import { frontKey, frontOf } from '../lib/millwork/frontMaterial';
import { lowerGapMm } from '../lib/millwork/corner';
import { cornerClashMismatches, vitrineSweepMismatches, wallMismatchMessage } from '../lib/millwork/walls';
import { buildFromSurvey, surveyOf, type Built } from './measurement-v2-fixture';
import { KITCHEN_COLLECTIONS, KITCHEN_MATERIAL_ITEMS, MATERIAL_ID_PREFIX, kitchenState, materialArticles, mezzOf, referenceKitchens, storesOf } from './measurement-v2-kitchens';

type BrowserObject = {
  title: string;
  zone: string;
  survey: Survey;
  measurement: unknown;
  requirements: RunRequirements;
  templateId: string | null;
  shape: CompositionKind;
  corners?: SavedCornerChoice[];
  runs?: Record<string, Run>;
  wallRuns?: Record<string, Run>;
  expect: { chain: string; modules: number };
};

function template(id: string): RunRequirements {
  const found = RUN_TEMPLATES.find((item) => item.id === id);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шаблона ${id} нет`);
  return requirementsFromTemplate(found);
}

function object(spec: Omit<BrowserObject, 'measurement' | 'expect'>): BrowserObject {
  const built = buildFromSurvey({
    title: spec.title,
    survey: spec.survey,
    shape: spec.shape,
    requirements: spec.requirements,
    corners: spec.corners,
    working: spec.runs?.optimal,
    editedWalls: spec.wallRuns,
  });
  if (built.refusal) throw new Error(`${spec.title}: ${built.refusal}`);
  return {
    ...spec,
    measurement: resolveSurvey(spec.survey).measurement,
    expect: { chain: built.chain.join(','), modules: built.segments.reduce((sum, run) => sum + run.modules.length, 0) },
  };
}

const corners: SavedCornerChoice[] = [{ walls: ['w1', 'w2'], lower: 'blind', upper: 'blind' }];

const L = object({
  title: 'Г 2360 + 2540',
  zone: 'Кухня',
  survey: surveyOf([{ length: 2360, run: true }, { length: 2540 }]),
  requirements: template('corner-compact'),
  templateId: 'corner-compact',
  shape: 'corner_l',
});

const U = object({
  title: 'П 2800 + 3200 + 1800',
  zone: 'Кухня',
  survey: surveyOf([{ length: 2800, run: true }, { length: 3200 }, { length: 1800 }]),
  requirements: template('u-shape'),
  templateId: 'u-shape',
  shape: 'u_shape',
});

const perimeter = object({
  title: 'Комната 3600 × 2800',
  zone: 'Кухня',
  survey: surveyOf([{ length: 3600, run: true }, { length: 2800 }, { length: 3600 }, { length: 2800 }]),
  requirements: template('corner-compact'),
  templateId: 'corner-compact',
  shape: 'corner_l',
});

/* Прежний замер, как у объекта заказчика: свободная сборка, один модуль 600 на стене 1 (1600…2200). */
const legacySurvey = surveyOf([{ length: 2360, turn: 'left', run: true }, { length: 2540, turn: 'left' }], { version: false });
const freeRequirements: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free' };
const empty = buildFromSurvey({ title: 'прежний Г налево', survey: legacySurvey, shape: 'corner_l', requirements: freeRequirements, corners });
if (empty.refusal) throw new Error(`legacy: ${empty.refusal}`);
const working = applyOps({ run: empty.segments[0], requirements: freeRequirements, ops: [{ op: 'add_module', kind: 'base', widthMm: 600, atMm: 1600 }] });
const legacy = object({
  title: 'прежний Г 2360 налево 2540',
  zone: 'Кухня',
  survey: legacySurvey,
  requirements: freeRequirements,
  templateId: null,
  shape: 'corner_l',
  corners,
  runs: { optimal: working },
});

/* Свободная сборка Г 2360 + 2540 (замер 2.0): на стене А модуль 600 на 200, на стене Б — 600 на 300 и 400 на 1200. */
const freeSurvey = surveyOf([{ length: 2360, run: true }, { length: 2540 }]);
const freeEmpty = buildFromSurvey({ title: 'Г свободная', survey: freeSurvey, shape: 'corner_l', requirements: freeRequirements, corners });
if (freeEmpty.refusal) throw new Error(`freeL: ${freeEmpty.refusal}`);
const freeA = applyOps({ run: freeEmpty.segments[0], requirements: freeRequirements, ops: [{ op: 'add_module', kind: 'base', widthMm: 600, atMm: 200 }] });
const freeB = applyOps({
  run: freeEmpty.segments[1],
  requirements: freeRequirements,
  ops: [
    { op: 'add_module', kind: 'base', widthMm: 600, atMm: 300 },
    { op: 'add_module', kind: 'base', widthMm: 400, atMm: 1200 },
  ],
});
const freeL = object({
  title: 'Г свободная 2360 + 2540',
  zone: 'Кухня',
  survey: freeSurvey,
  requirements: freeRequirements,
  templateId: null,
  shape: 'corner_l',
  corners,
  runs: { optimal: freeA },
  wallRuns: { w2: freeB },
});

/* ─────────────────────────  Три эталонные кухни  ───────────────────────── */

/**
 * Что сцена обязана показать: место каждого модуля на полу (мм мира) и его
 * отметки; фасады по цвету (закрытые — пачками); строки деталировки
 * антресолей. Считает тот же движок, что собрал кухню.
 */
function expectOf(built: Built, production: ProductionSettings) {
  const modules: Record<string, { wall: string; min: [number, number]; max: [number, number]; y: [number, number] }> = {};
  built.rows.forEach((row, i) => {
    const run = built.segments[i];
    const places = runPlaces(run);
    for (const m of row.modules) {
      const place = places.find((p) => p.unit.id === m.id)!;
      modules[m.id] = { wall: row.wallId, min: m.min, max: m.max, y: [Math.round(place.y * 1000), Math.round((place.y + place.heightM) * 1000)] };
    }
  });
  const shop = { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production };
  /* Закрытые фасады по материалу: цвет и позиция каталога — через ключ фасада модуля (фальш-панель — ключ соседа). */
  const fronts: Record<string, { hex: string; itemId: string | null; count: number }> = {};
  for (const run of built.segments) {
    const units = [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];
    const byKey = new Map(units.map((u) => [frontKey(frontOf(u)), frontOf(u)] as const));
    const grouped = runBoxesByModule(run, shop);
    for (const box of [...grouped.fillers, ...grouped.modules.flatMap((entry) => entry.boxes)]) {
      if (box.material !== 'front' || !box.frontKey) continue;
      const spec = byKey.get(box.frontKey);
      const key = spec?.itemId ?? box.frontKey;
      fronts[key] = fronts[key] ?? { hex: (spec?.colorHex ?? '').toLowerCase(), itemId: spec?.itemId ?? null, count: 0 };
      fronts[key].count += 1;
    }
  }
  const panels = built.segments.flatMap((run) => {
    const mezz = new Set([...mezzOf(run), ...storesOf(run)].map((m) => m.id));
    return buildPanels({ run, production })
      .filter((p) => (mezz.has(p.moduleId) && p.name === 'Боковина') || /антресоли/.test(p.name))
      .map((p) => ({ wall: run.wallId ?? '', moduleId: p.moduleId, name: p.name, size: `${p.lengthMm}x${p.widthMm}x${p.thicknessMm}`, qty: p.qty }));
  });
  /* Итог и строки без цены — смета объекта путём экрана (`unpricedLines`), ключи — как у `__mwEstimateLines`. */
  return { modules, fronts, panels, total: built.total, unpriced: built.unpriced, mezz: built.segments.flatMap((run) => mezzOf(run).map((m) => m.id)) };
}

const kitchens = Object.fromEntries(
  referenceKitchens().map((k) => {
    /*
     * Кухня 3 записана без «в линию»: режим включают кнопкой блока «Антресоль».
     * Кухня 2 записана с антресолью при «ведёт стена А»: к стене Б её переводит
     * карточка угла «Антресоль: Стена Б идёт в угол».
     */
    const stored = k.alignWall
      ? { working: k.alignWall.before, wallRuns: k.wallRuns }
      : k.ownerChange
        ? { working: k.ownerChange.working, wallRuns: k.ownerChange.wallRuns, corners: k.ownerChange.corners }
        : undefined;
    const before = k.alignWall
      ? buildFromSurvey({ title: `${k.title} без режима`, survey: k.survey, shape: k.shape, requirements: k.requirements, corners: k.corners, production: k.production, working: k.alignWall.before, editedWalls: k.wallRuns, materials: KITCHEN_MATERIAL_ITEMS })
      : (k.ownerChange?.built ?? null);
    return [
      k.key,
      {
        title: k.title,
        photo: k.photo,
        zone: 'Кухня',
        survey: k.survey,
        measurement: resolveSurvey(k.survey).measurement,
        state: kitchenState(k, stored),
        expect: expectOf(k.built, k.production),
        before: before ? expectOf(before, k.production) : null,
        alignWall: k.alignWall?.wallId ?? null,
        ownerCard: k.ownerChange
          ? { key: k.ownerChange.card.key, changes: k.ownerChange.card.changes ?? [], opening: k.ownerChange.card.opening ?? null }
          : null,
      },
    ];
  }),
);

/* ─────────────────────────  До потолка и зазор цеха  ───────────────────────── */

/* Прямая 3800 «до потолка», потолок 2700: без зазора верх 2700, с зазором цеха 30 мм — 2670. */
/*
 * Готовое решение «до потолка»: объект без решения и без правок Studio
 * открывает свободной сборкой — пустой стеной (STAGE 01A), мерить было бы нечего.
 */
const toCeilingRequirements: RunRequirements = template('linear-to-ceiling');
if (!toCeilingRequirements.options?.upperToCeiling) throw new Error('gap: шаблон «linear-to-ceiling» не «до потолка»');
const ceilingSurvey = surveyOf([{ length: 3800, run: true }], { ceiling: 2700 });
const topOf = (built: Built) => Math.max(...built.segments.flatMap((run) => runPlaces(run).map((p) => Math.round((p.y + p.heightM) * 1000))));
const gapFlat = buildFromSurvey({ title: 'до потолка, зазор 0', survey: ceilingSurvey, shape: 'linear', requirements: toCeilingRequirements });
const gapped = buildFromSurvey({
  title: 'до потолка, зазор 30',
  survey: ceilingSurvey,
  shape: 'linear',
  requirements: toCeilingRequirements,
  production: { ...DEFAULT_PRODUCTION, ceilingGap: { gapMm: 30, confirmed: false } },
});
if (gapFlat.refusal || gapped.refusal) throw new Error(`gap: ${gapFlat.refusal ?? gapped.refusal}`);
const gap = {
  ...object({
    title: 'Прямая 3800 до потолка',
    zone: 'Кухня',
    survey: ceilingSurvey,
    requirements: toCeilingRequirements,
    templateId: 'linear-to-ceiling',
    shape: 'linear',
  }),
  tops: { flat: topOf(gapFlat), gapped: topOf(gapped) },
};

/* ─────────────────────────  Свободная П: стены А, Б, В и холодильник  ───────────────────────── */

/* П 2800 + 3200 + 1800 (замер 2.0), свободная сборка: холодильник 600 на стене А, мойка на стене Б, шкаф 600 на стене В. */
const uSurvey = surveyOf([{ length: 2800, run: true }, { length: 3200 }, { length: 1800 }]);
const uCorners: SavedCornerChoice[] = [
  { walls: ['w1', 'w2'], lower: 'blind', upper: 'blind' },
  { walls: ['w2', 'w3'], lower: 'blind', upper: 'blind' },
];
const uEmpty = buildFromSurvey({ title: 'П свободная', survey: uSurvey, shape: 'u_shape', requirements: freeRequirements, corners: uCorners });
if (uEmpty.refusal) throw new Error(`freeU: ${uEmpty.refusal}`);
const [uA0, uB0, uC0] = uEmpty.segments;
/* Прибор свободная сборка ставит в первое место слева (отметку у прибора `add_module` не читает) — на свою отметку его ведёт `move_module`, как человек полем «от левого угла». */
const placed = (run: Run, op: MillworkOp, atMm: number): Run => {
  const added = applyOps({ run, requirements: freeRequirements, ops: [op] });
  const fresh = added.modules.find((m) => !run.modules.some((old) => old.id === m.id));
  if (!fresh) throw new Error(`freeU: модуль не встал — ${added.warnings.join(' ')}`);
  return applyOps({ run: added, requirements: freeRequirements, ops: [{ op: 'move_module', moduleId: fresh.id, offsetMm: atMm, exact: true }] });
};
const uA = placed(uA0, { op: 'add_module', kind: 'tall', widthMm: 600, appliance: 'fridge' }, 200);
const uB = placed(uB0, { op: 'add_module', kind: 'base', widthMm: 600, appliance: 'sink600' }, 1000);
const uC = applyOps({ run: uC0, requirements: freeRequirements, ops: [{ op: 'add_module', kind: 'base', widthMm: 600, atMm: 300 }] });
const freeU = object({
  title: 'П свободная 2800 + 3200 + 1800',
  zone: 'Кухня',
  survey: uSurvey,
  requirements: freeRequirements,
  templateId: null,
  shape: 'u_shape',
  corners: uCorners,
  runs: { optimal: uA },
  wallRuns: { w2: uB, w3: uC },
});
/* Где на стене начинается ряд: «от левого угла» = начало ряда + место в ряду. */
const startOn = (run: Run) => lowerGapMm(run, 'start');
/*
 * ПЕРЕНОС ХОЛОДИЛЬНИКА А → Б — ТЕМ ЖЕ ПУТЁМ, ЧТО ПРЕДПРОСМОТР ЭКРАНА (`transferPreview`):
 * снять со стены А (`remove_module`), поставить целиком на отметку ряда Б
 * (`add_module` с `module`), ряды экрана после переноса — и запрет экрана по
 * ним (ход у угла `cornerClashMismatches`, дверь витрины
 * `vitrineSweepMismatches`) его словами (`wallMismatchMessage`).
 * 1800 ряда Б — глухая часть угла Б–В (стена Б ведёт угол): дверь не откроется,
 * экран запрёт цену; 300 — без запрета.
 */
const fridgeUnit = uA.modules.find((m) => m.appliance === 'fridge');
if (!fridgeUnit) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: холодильника на стене А свободной П нет');
const uBuilt = (working: Run, b: Run, c: Run) =>
  buildFromSurvey({ title: 'П свободная', survey: uSurvey, shape: 'u_shape', requirements: freeRequirements, corners: uCorners, working, editedWalls: { w2: b, w3: c } });
const transferTo = (atOnRow: number) => {
  const source = applyOps({ run: uA, requirements: freeRequirements, ops: [{ op: 'remove_module', moduleId: fridgeUnit.id }] });
  const target = applyOps({ run: uB, requirements: freeRequirements, ops: [{ op: 'add_module', kind: fridgeUnit.kind, module: fridgeUnit, atMm: atOnRow }] });
  if (!target.modules.some((m) => !uB.modules.some((old) => old.id === m.id))) throw new Error(`freeU: холодильник на ${atOnRow} ряда Б не встал — ${target.warnings.join(' ')}`);
  const built = uBuilt(source, target, uC);
  if (built.refusal) throw new Error(`freeU: ${built.refusal}`);
  const byClash = cornerClashMismatches({ runs: built.segments, places: built.places, production: DEFAULT_PRODUCTION, edited: () => true, composed: built.layout?.cornerClashes });
  const bySweep = vitrineSweepMismatches({ runs: built.segments, production: DEFAULT_PRODUCTION, skip: byClash.map((m) => m.index) });
  return { atOnRow, total: built.total, blocked: [...byClash, ...bySweep].map((m) => wallMismatchMessage(m)) };
};
const freeUTransfer = { before: uBuilt(uA, uB, uC).total, blocked: transferTo(1800), ok: transferTo(300) };
if (freeUTransfer.blocked.blocked.length === 0) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: перенос на 1800 ряда Б (глухая часть угла Б–В) обязан запираться ходом у угла');
if (freeUTransfer.ok.blocked.length > 0) throw new Error(`freeU: перенос на 300 ряда Б запирается — ${freeUTransfer.ok.blocked.join(' | ')}`);

const freeUModules = {
  fridge: uA.modules.find((m) => m.appliance === 'fridge')?.id ?? null,
  sink: uB.modules[0]?.id ?? null,
  c: uC.modules[0]?.id ?? null,
  starts: { w1: 0, w2: startOn(uB0), w3: startOn(uC0) },
  lengths: { w1: uA0.lengthMm, w2: uB0.lengthMm, w3: uC0.lengthMm },
};

process.stdout.write(
  JSON.stringify({
    L,
    U,
    perimeter,
    legacy,
    legacyModule: working.modules[0]?.id ?? null,
    freeL,
    freeModules: { a: freeA.modules.map((m) => m.id), b: freeB.modules.map((m) => m.id), bStart: freeEmpty.segments[1].corner ? 2540 - freeEmpty.segments[1].lengthMm : 0 },
    kitchens,
    materialArticles: materialArticles(),
    materialCollections: [...KITCHEN_COLLECTIONS],
    materialPrefix: MATERIAL_ID_PREFIX,
    gap,
    freeU,
    freeUModules,
    freeUTransfer,
  }),
);
