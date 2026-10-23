/**
 * HANDLE-REAL — РУЧКИ СВОЕЙ ФОРМОЙ (входит в test:hardware).
 *
 * Отдельный запуск: `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-handles.ts`
 * — тот же набор, свой счёт (для отката правки при сохранённом тесте).
 *
 * Путь экрана: каталог организации из фактов (`hardwareCatalogRow`) →
 * `objectInput` с каталогом → `composeVariants` → правка `applyOps` с тем же
 * каталогом → `composeVariants` снова. Сцену меряем коробками, которые
 * рисует `Cabinet3D` (`runBoxes` с каталогом и школой цеха), открытую
 * створку — `leafPoses` (тем же числам следует `InteractiveDoor`), смету —
 * сметой варианта, раскрой — `buildPanels`, присадку — `moduleDrilling`.
 *
 * Объект — демо-стена без окна в свободной сборке: две дверцы 800
 * (`door_two`), дверца 450 на левой петле, ящики 600 (три фронта), дверца
 * 450 на правой петле, верхний шкаф 600 (как `handles-fixture.ts`).
 */
import { DEFAULT_PRODUCTION, type CatalogEntryFull, type HardwareItem } from '../types/catalog';
import type { Measurement, MillworkOp, Module, Run, RunRequirements, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow, type HardwareFact } from '../lib/millwork/hardwareCatalog';
import { HARDWARE_LIGHT_FIELDS } from '../lib/catalog';
import { leafPoses, runBoxes, runPlaces, sceneLeaves, type PartBox } from '../lib/millwork/cabinetBoxes';
import { buildPanels } from '../lib/millwork/panels';
import { moduleDrilling } from '../lib/millwork/drilling';
import { model3dStatusOf } from '../lib/millwork/hardwareMedia';
import { openingHardware } from '../lib/millwork/opening';
import { moduleCarcassHeightMm } from '../lib/millwork/fill';
import { cornerOfModule } from '../lib/millwork/corner';
import { handleBoundsMm, handleItemModel, type HandleModel, type HandleOrient } from '../lib/millwork/handleModel';
import { handleMesh, meshBoundsMm, type HandleMeshData } from '../lib/millwork/handleMeshData';

type Check = (name: string, condition: boolean, detail?: string) => void;

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const MM = 1000;
const SHOP = DEFAULT_PRODUCTION;

/* ─────────────────────────  каталог из фактов  ───────────────────────── */

/** Цены ручек — компании (у фактов цены нет): по ним сверяются строки сметы. */
const PRICES: Record<string, number> = {
  '115.52.630': 2500,
  '134.88.610': 1800,
  '126.14.612': 3900,
  '151.38.100': 2700,
  '151.38.102': 2700,
};

function rowsOf(facts: HardwareFact[]): CatalogEntryFull[] {
  return facts.map((fact) => {
    const row = hardwareCatalogRow(fact);
    return {
      id: `hw:${fact.article}`,
      org_id: 'org-hr',
      category_id: 'cat-hardware',
      article: row.article,
      name_ru: row.name_ru,
      name_kk: row.name_kk,
      description: '',
      price: PRICES[fact.hardware.manufacturerArticle ?? ''] ?? row.price,
      unit: row.unit,
      dimensions: {},
      tiling: {},
      meta: { hardware: fact.hardware } as unknown as CatalogEntryFull['meta'],
      is_active: true,
      assets: [],
    } as unknown as CatalogEntryFull;
  });
}

const CATALOG = hardwareCatalog(rowsOf(HARDWARE_FACTS));
const byArticle = (article: string): HardwareItem => {
  const found = Array.from(CATALOG.values()).find((i) => i.hardware.manufacturerArticle === article);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ручки ${article} в каталоге нет`);
  return found;
};
const BAR = byArticle('115.52.630');
const KNOB = byArticle('134.88.610');
const EDGE = byArticle('126.14.612');
const LONG_BAR = byArticle('115.52.670');
const FLUSH_BRONZE = byArticle('151.38.100');
const FLUSH_BLACK = byArticle('151.38.102');
const GOLA = Array.from(CATALOG.values()).find((i) => i.hardware.subcategory === 'profile_handle');

/* ─────────────────────────  кухня путём экрана  ───────────────────────── */

const noWindow: Measurement = {
  ...DEMO_MEASUREMENT,
  id: 'hr-kitchen',
  walls: DEMO_MEASUREMENT.walls.map((wall) => ({ ...wall, openings: wall.openings.filter((o) => o.kind !== 'window') })),
};
const FREE: RunRequirements = { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [] };

function kitchen(catalog: Map<string, HardwareItem> = CATALOG) {
  const base = workspaceInput({ title: 'HANDLE-REAL', zone: 'Кухня', measurement: noWindow, requirements: FREE, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({
    base,
    resolution: null,
    requirements: FREE,
    rates: DEMO_RATES,
    production: SHOP,
    milling: new Map(),
    carcass: new Map(),
    materials: new Map(),
    hardware: catalog,
  });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!;
  /** Правка как у `runOps`: ряд с отказом тоже записывается — движок возвращает его без правки. */
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements: FREE, ops: list, openings: input.openings, hardware: catalog });
    edited = { optimal: next };
    return { warnings: next.warnings, shown: shown() };
  };
  const must = (list: MillworkOp[]) => {
    const out = ops(list);
    if (out.warnings.length > 0) throw new Error(`движок отказал: ${out.warnings.join(' | ')}`);
    return out;
  };
  must([{ op: 'add_module', kind: 'base', widthMm: 800, variant: 'door_two' }]);
  must([{ op: 'add_module', kind: 'base', widthMm: 450, afterModuleId: shown().run.modules.at(-1)!.id }]);
  must([{ op: 'add_module', kind: 'base', widthMm: 600, variant: 'drawers', afterModuleId: shown().run.modules.at(-1)!.id }]);
  must([{ op: 'add_module', kind: 'base', widthMm: 450, afterModuleId: shown().run.modules.at(-1)!.id }]);
  const [double, left, drawers, right] = shown().run.modules;
  if (!double || double.doorCount !== 2) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: двух дверец нет (${double?.id ?? '—'})`);
  if (!drawers || (drawers.fill?.drawerHeights.length ?? 0) !== 3) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: у ящиков не три фронта');
  if (!left || !right) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: одностворчатых модулей нет');
  must([
    { op: 'set_opening', moduleId: left.id, opening: 'left' },
    { op: 'set_opening', moduleId: right.id, opening: 'right' },
  ]);
  must([{ op: 'add_module', kind: 'upper', widthMm: 600, row: 'upper', atMm: double.offsetMm } as MillworkOp]);
  const upper = shown().run.upperSegments.flatMap((segment) => segment.modules).find((u) => u.section !== 'mezzanine');
  if (!upper) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: верхнего шкафа нет');
  return { shown, ops, must, ids: { double: double.id, left: left.id, drawers: drawers.id, right: right.id, upper: upper.id } };
}

/** Коробки сцены — как у `Cabinet3D`: каталог фурнитуры и школа цеха экрана. */
const sceneOf = (run: Run, catalog: Map<string, HardwareItem> = CATALOG): PartBox[] =>
  runBoxes(run, {
    hardware: catalog,
    production: SHOP,
    thicknessMm: SHOP.carcassMm,
    frontThicknessMm: SHOP.frontMm,
    gapMm: SHOP.frontGapMm,
  });
const handlesOf = (boxes: PartBox[], moduleId: string) =>
  boxes.filter((box) => box.node === 'handle' && box.handle && (box.part ?? '').startsWith(`${moduleId}:`));
const leafBox = (boxes: PartBox[], part: string) => {
  const found = boxes.find((box) => box.material === 'front' && box.part === part);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: фасада ${part} в сцене нет`);
  return found;
};
const moduleOf = (run: Run, id: string): Module => {
  const found = allModules(run).find((unit) => unit.id === id);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} в ряду нет`);
  return found;
};
const line = (run: { estimate: { lines: { key: string; quantity: number; total: number; rate: number }[] } }, key: string) =>
  run.estimate.lines.find((l) => l.key === key);

/* ─────────────────────────  сетка: замкнута, наружу, по габариту  ───────────────────────── */

function meshFlaws(data: HandleMeshData): string[] {
  const flaws: string[] = [];
  const p = data.positions;
  const directed = new Map<string, number>();
  let volume = 0;
  let degenerate = 0;
  for (let i = 0; i < data.indices.length; i += 3) {
    const [a, b, c] = [data.indices[i], data.indices[i + 1], data.indices[i + 2]];
    const A = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2]];
    const B = [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
    const C = [p[c * 3], p[c * 3 + 1], p[c * 3 + 2]];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(n[0], n[1], n[2]) / 2 < 1e-6) degenerate += 1;
    volume += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
    /* Рёбра — по координатам: сшивка сетки не обязана делить вершины. */
    const key = (X: number[]) => X.map((x) => x.toFixed(4)).join(',');
    for (const [s, t] of [
      [A, B],
      [B, C],
      [C, A],
    ]) {
      const e = `${key(s)}>${key(t)}`;
      directed.set(e, (directed.get(e) ?? 0) + 1);
    }
  }
  let open = 0;
  let doubled = 0;
  for (const [edge, count] of Array.from(directed.entries())) {
    if (count > 1) doubled += 1;
    const [s, t] = edge.split('>');
    if (!directed.has(`${t}>${s}`)) open += 1;
  }
  if (degenerate > 0) flaws.push(`вырожденных граней ${degenerate}`);
  if (open > 0) flaws.push(`рёбер без пары ${open}`);
  if (doubled > 0) flaws.push(`рёбер в одну сторону дважды ${doubled}`);
  if (!(volume > 0)) flaws.push(`объём ${volume.toFixed(2)} — нормали внутрь`);
  for (let i = 0; i < data.normals.length; i += 3) {
    const len = Math.hypot(data.normals[i], data.normals[i + 1], data.normals[i + 2]);
    if (Math.abs(len - 1) > 1e-3) {
      flaws.push(`нормаль длины ${len.toFixed(3)}`);
      break;
    }
  }
  return flaws;
}

/* ═════════════════════════════════════════════════════════════════════════ */

export function handleChecks(check: Check): void {
  const handleFacts = HARDWARE_FACTS.filter((fact) => fact.hardware.category === 'handle');

  /* ── H1. Статус модели — по размерам паспорта, словами ── */
  {
    const tally = new Map<string, number>();
    const silent: string[] = [];
    for (const fact of handleFacts) {
      const shaped = handleItemModel(fact);
      tally.set(shaped.status, (tally.get(shaped.status) ?? 0) + 1);
      if (!shaped.words) silent.push(fact.hardware.manufacturerArticle ?? fact.article);
      /* Статус карточки — тот же, что рисует сцена. */
      if (model3dStatusOf(CATALOG.get(`hw:${fact.article}`)!) !== shaped.status) silent.push(`${fact.article}: карточка ≠ сцена`);
    }
    const gola = handleFacts.filter((f) => f.hardware.subcategory === 'profile_handle').map((f) => handleItemModel(f));
    const conflict = handleItemModel(handleFacts.find((f) => f.hardware.manufacturerArticle === '115.52.619')!);
    check(
      'H1 ручек в фактах 63: по размерам паспорта 13 (скобы 7, кнопки 6), по чертежу 25 (кромочные 17, врезные 8), без 3D 25 (Gola 8, принадлежности 16, скоба без длины 1); у каждой — слова, карточка = сцена',
      handleFacts.length === 63 &&
        tally.get('MEASURED_RECONSTRUCTION') === 13 &&
        tally.get('VISUAL_RECONSTRUCTION') === 25 &&
        tally.get('NO_3D') === 25 &&
        !tally.has('OFFICIAL_CAD') &&
        silent.length === 0 &&
        gola.length === 8 &&
        gola.every((g) => g.model === null && /системы без ручек/.test(g.words)) &&
        conflict.model === null &&
        /длина ручки не задана/.test(conflict.words),
      `${JSON.stringify(Object.fromEntries(tally))} · без слов ${silent.slice(0, 3).join(', ') || 0}`,
    );
  }

  /* ── H2. Каждая сетка замкнута, смотрит наружу и совпадает с габаритом модели ── */
  {
    let meshes = 0;
    const bad: string[] = [];
    let fineTris = 0;
    let coarseTris = 0;
    for (const fact of handleFacts) {
      const model = handleItemModel(fact).model;
      if (!model) continue;
      const orients: HandleOrient[] = model.shape === 'edge' ? ['top', 'bottom'] : ['h', 'v'];
      for (const orient of orients) {
        for (const fine of [true, false]) {
          meshes += 1;
          const mesh = handleMesh(model, orient, 18, fine);
          const tris = mesh.body.indices.length / 3 + (mesh.accent ? mesh.accent.indices.length / 3 : 0);
          if (fine) fineTris += tris;
          else coarseTris += tris;
          const flaws = [...meshFlaws(mesh.body), ...(mesh.accent ? meshFlaws(mesh.accent).map((f) => `кольца: ${f}`) : [])];
          const drawn = meshBoundsMm(mesh);
          const said = handleBoundsMm(model, orient, 18);
          const off = Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(drawn.min[i] - said.min[i]), Math.abs(drawn.max[i] - said.max[i])]));
          if (off > 0.01) flaws.push(`габарит сетки расходится с моделью на ${off.toFixed(3)} мм`);
          if (flaws.length > 0) bad.push(`${fact.hardware.manufacturerArticle} ${orient} ${fine ? 'f' : 'c'}: ${flaws.join(', ')}`);
        }
      }
    }
    check(
      'H2 сеток 152 (38 моделей × 2 поворота × 2 подробности): замкнуты, рёбра парные, граней без площади 0, объём наружу, габарит сетки = габарит модели ± 0,01 мм; грубая сетка легче',
      meshes === 152 && bad.length === 0 && coarseTris < fineTris,
      `сеток ${meshes}, с изъяном ${bad.length}${bad[0] ? ` (${bad[0]})` : ''} · треугольников ${fineTris} → ${coarseTris}`,
    );
  }

  /* ── H3. Форма и размеры — из паспорта артикула ── */
  {
    const size = (model: HandleModel, orient: HandleOrient) => {
      const b = handleBoundsMm(model, orient, 18);
      return [0, 1, 2].map((i) => Math.round((b.max[i] - b.min[i]) * 100) / 100);
    };
    const bar = handleItemModel(BAR).model!;
    const knob = handleItemModel(KNOB).model!;
    const edge = handleItemModel(EDGE).model!;
    const flush = handleItemModel(FLUSH_BRONZE).model!;
    const d = (item: HardwareItem) => item.hardware.dimensionsMm ?? {};
    check(
      'H3 скоба 115.52.630 — A 174 × Ø14 × B 45 (стоя — 14 × 174); кнопка 134.88.610 — Ø28 × B 28; кромочная 126.14.612 — A 300; врезная 151.38.100 — Ø50, фланец 3: формы и ключи разные',
      JSON.stringify(size(bar, 'h')) === JSON.stringify([d(BAR).length, d(BAR).diameter, d(BAR).projection]) &&
        JSON.stringify(size(bar, 'v')) === JSON.stringify([d(BAR).diameter, d(BAR).length, d(BAR).projection]) &&
        bar.centersMm === d(BAR).holeSpacing &&
        JSON.stringify(size(knob, 'h')) === JSON.stringify([d(KNOB).diameter, d(KNOB).diameter, d(KNOB).projection]) &&
        size(edge, 'top')[0] === d(EDGE).length &&
        JSON.stringify(size(flush, 'h')) === JSON.stringify([d(FLUSH_BRONZE).flangeDiameter, d(FLUSH_BRONZE).flangeDiameter, d(FLUSH_BRONZE).flangeThickness]) &&
        new Set([bar.shape, knob.shape, edge.shape, flush.shape]).size === 4 &&
        new Set([bar.key, knob.key, edge.key, flush.key]).size === 4,
      `скоба ${size(bar, 'h').join('×')} · кнопка ${size(knob, 'h').join('×')} · кромочная ${size(edge, 'top').join('×')} · врезная ${size(flush, 'h').join('×')}`,
    );
  }

  /* ── H4. Установка путём экрана: ручка позиции на лице створки, напротив петель ── */
  {
    const k = kitchen();
    const before = handlesOf(sceneOf(k.shown().run), k.ids.left);
    k.must([{ op: 'set_fitting', moduleId: k.ids.left, slot: 'handle', itemId: BAR.id }]);
    const boxes = sceneOf(k.shown().run);
    const handles = handlesOf(boxes, k.ids.left);
    const h = handles[0];
    const leaf = leafBox(boxes, `${k.ids.left}:door:0`);
    const t = SHOP.frontMm / MM;
    const faceZ = leaf.position[2] + leaf.scale[2] / 2;
    const zMin = h ? h.position[2] - h.scale[2] / 2 : NaN;
    const inside =
      h &&
      h.position[0] - h.scale[0] / 2 >= leaf.position[0] - leaf.scale[0] / 2 - 1e-6 &&
      h.position[0] + h.scale[0] / 2 <= leaf.position[0] + leaf.scale[0] / 2 + 1e-6 &&
      h.position[1] - h.scale[1] / 2 >= leaf.position[1] - leaf.scale[1] / 2 - 1e-6 &&
      h.position[1] + h.scale[1] / 2 <= leaf.position[1] + leaf.scale[1] / 2 + 1e-6;
    check(
      'H4 скоба на дверце с левыми петлями: была условная, стала 115.52.630 по модели; стоит на лице фасада (зазор 0 мм), в его границах, справа от середины — напротив петель; вылет 45 мм',
      before.length === 1 &&
        before[0].handle!.itemId === null &&
        before[0].handle!.model.status === 'VISUAL_APPROXIMATION' &&
        handles.length === 1 &&
        h.handle!.itemId === BAR.id &&
        h.handle!.model.shape === 'bar' &&
        Math.abs(zMin - faceZ) < 1e-4 &&
        Math.abs(h.scale[2] - 0.045) < 1e-6 &&
        Boolean(inside) &&
        h.position[0] > leaf.position[0] &&
        Math.abs(faceZ - t) < 0.01,
      h
        ? `зазор ${((zMin - faceZ) * MM).toFixed(2)} мм · центр ручки ${(h.position[0] * MM).toFixed(0)} при центре створки ${(leaf.position[0] * MM).toFixed(0)} · габарит ${h.scale.map((v) => +(v * MM).toFixed(1)).join('×')}`
        : 'ручки нет',
    );
  }

  /* ── H5. Ручка одной створки не трогает вторую; ручка модуля — на все ── */
  {
    const k = kitchen();
    k.must([{ op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: BAR.id }]);
    const f1 = k.shown().run.fingerprint;
    k.must([{ op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: KNOB.id, leaf: 'door:1' }]);
    const split = handlesOf(sceneOf(k.shown().run), k.ids.double);
    const of = (boxes: PartBox[], leaf: string) => boxes.find((b) => b.part === `${k.ids.double}:${leaf}`)?.handle;
    const f2 = k.shown().run.fingerprint;
    k.must([{ op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: EDGE.id }]);
    const all = handlesOf(sceneOf(k.shown().run), k.ids.double);
    const fittings = moduleOf(k.shown().run, k.ids.double).fittings ?? [];
    /* Деталь, которой у модуля нет, — отказ словами, ряд прежний. */
    const fp = k.shown().run.fingerprint;
    const wrong = k.ops([{ op: 'set_fitting', moduleId: k.ids.left, slot: 'handle', itemId: KNOB.id, leaf: 'door:1' }]);
    check(
      'H5 двери 800: скоба на модуль → кнопка только на дверь 2 — дверь 1 со скобой; отпечаток другой; кромочная на модуль — на обе, своя ручка двери 2 снята; дверь 2 у одностворчатого — отказ словами, ряд прежний',
      split.length === 2 &&
        of(split, 'door:0')?.itemId === BAR.id &&
        of(split, 'door:0')?.model.shape === 'bar' &&
        of(split, 'door:1')?.itemId === KNOB.id &&
        of(split, 'door:1')?.model.shape === 'knob' &&
        f2 !== f1 &&
        all.length === 2 &&
        all.every((b) => b.handle!.itemId === EDGE.id && b.handle!.model.shape === 'edge') &&
        fittings.filter((f) => f.slot === 'handle').length === 1 &&
        !fittings.some((f) => f.leaf) &&
        wrong.warnings.length === 1 &&
        /нет фасада «дверь 2»/.test(wrong.warnings[0]) &&
        wrong.shown.run.fingerprint === fp,
      `дверь 1 ${of(split, 'door:0')?.model.shape} · дверь 2 ${of(split, 'door:1')?.model.shape} · после модуля ${all.map((b) => b.handle!.model.shape).join(', ')} · ${wrong.warnings[0] ?? 'без отказа'}`,
    );
  }

  /* ── H6. «Без ручки» — ручки нет ни на закрытом фасаде, ни на едущем; позиция помнится ── */
  {
    const k = kitchen();
    k.must([
      { op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: BAR.id },
      { op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: KNOB.id, leaf: 'door:1' },
      { op: 'set_fitting', moduleId: k.ids.drawers, slot: 'handle', itemId: BAR.id },
    ]);
    const pushBefore = line(k.shown(), 'push_to_open')?.quantity ?? 0;
    k.must([
      { op: 'set_handle', moduleId: k.ids.double, handle: 'none' },
      { op: 'set_handle', moduleId: k.ids.drawers, handle: 'none' },
    ]);
    const off = k.shown();
    const boxes = sceneOf(off.run);
    const run = off.run;
    const doubleUnit = moduleOf(run, k.ids.double);
    const places = runPlaces(run);
    const entry = places.find((p) => p.unit.id === k.ids.double)!;
    /* Едущая створка несёт то, что лежит в пачке на её деталь (`riders`): ручки там нет — и на ходу нет. */
    const moving = sceneLeaves(doubleUnit, entry.heightM)
      .filter((leaf) => leaf.kind === 'door')
      .flatMap((leaf) =>
        leafPoses({
          opening: leaf.opening,
          x: leaf.xM,
          y: 0,
          width: leaf.widthM,
          height: entry.heightM,
          thickness: SHOP.frontMm / MM,
          gap: SHOP.frontGapMm / MM,
          handle: boxes.find((b) => b.part === leaf.id && b.node === 'handle') ?? null,
          s: 1,
        }),
      );
    const items = off.estimate.lines.filter((l) => l.key.startsWith('fitting_handle_'));
    const kept = (doubleUnit.fittings ?? []).filter((f) => f.slot === 'handle').length;
    const back = k.must([
      { op: 'set_handle', moduleId: k.ids.double, handle: 'bar' },
      { op: 'set_handle', moduleId: k.ids.drawers, handle: 'bar' },
    ]).shown;
    const backBoxes = sceneOf(back.run);
    check(
      'H6 «Без ручки» на дверях и ящиках: ручек в сцене 0 (закрытые 0, на ходу 0), строк позиций ручек 0, нажимных +5; позиции помнятся (2) и возвращаются со «Скоба» без повторной установки',
      handlesOf(boxes, k.ids.double).length === 0 &&
        handlesOf(boxes, k.ids.drawers).length === 0 &&
        moving.length === 2 &&
        moving.every((pose) => pose.role === 'front') &&
        items.length === 0 &&
        (line(off, 'push_to_open')?.quantity ?? 0) - pushBefore === 5 &&
        kept === 2 &&
        handlesOf(backBoxes, k.ids.double).map((b) => b.handle!.model.shape).sort().join() === 'bar,knob' &&
        handlesOf(backBoxes, k.ids.drawers).length === 3,
      `закрытых ${handlesOf(boxes, k.ids.double).length + handlesOf(boxes, k.ids.drawers).length} · на ходу ${moving.filter((p) => p.role === 'handle').length} · строк ${items.length} · нажимных +${(line(off, 'push_to_open')?.quantity ?? 0) - pushBefore} · помнится ${kept}`,
    );
  }

  /* ── H7. Ручка едет с полотном жёстко: на любом ходу то же место на лице ── */
  {
    const k = kitchen();
    k.must([
      { op: 'set_fitting', moduleId: k.ids.left, slot: 'handle', itemId: KNOB.id },
      { op: 'set_opening', moduleId: k.ids.upper, opening: 'lift' },
    ]);
    const run = k.shown().run;
    const boxes = sceneOf(run);
    const drift: string[] = [];
    let poses = 0;
    for (const id of [k.ids.left, k.ids.upper]) {
      const unit = moduleOf(run, id);
      const entry = runPlaces(run).find((p) => p.unit.id === id)!;
      for (const leaf of sceneLeaves(unit, entry.heightM).filter((l) => l.kind === 'door')) {
        /* Коробка ручки — в осях модуля, как у `localBoxesOf`. */
        const own = boxes.find((b) => b.part === leaf.id && b.node === 'handle');
        if (!own) {
          drift.push(`${leaf.id}: ручки нет`);
          continue;
        }
        const local = { ...own, position: [own.position[0] - entry.x, own.position[1] - entry.y, own.position[2] - entry.zM] as [number, number, number] };
        let first: number | null = null;
        for (const s of [0, 0.25, 0.5, 0.75, 1]) {
          poses += 1;
          const posed = leafPoses({
            opening: leaf.opening,
            x: leaf.xM,
            y: 0,
            width: leaf.widthM,
            height: entry.heightM,
            thickness: SHOP.frontMm / MM,
            gap: SHOP.frontGapMm / MM,
            handle: local,
            s,
          });
          const front = posed.find((p) => p.role === 'front')!;
          const handle = posed.find((p) => p.role === 'handle');
          if (!handle) {
            drift.push(`${leaf.id} ход ${s}: ручки нет`);
            continue;
          }
          const gapM = Math.hypot(handle.center[0] - front.center[0], handle.center[1] - front.center[1], handle.center[2] - front.center[2]);
          if (first === null) first = gapM;
          else if (Math.abs(gapM - first) > 1e-9) drift.push(`${leaf.id} ход ${s}: ручка уехала на ${((gapM - first) * MM).toFixed(3)} мм`);
          /* Лицо полотна — по нормали полотна: ручка всегда перед ним. */
          const yaw = front.yaw ?? 0;
          const pitch = front.pitch ?? 0;
          const n = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
          const along = (handle.center[0] - front.center[0]) * n[0] + (handle.center[1] - front.center[1]) * n[1] + (handle.center[2] - front.center[2]) * n[2];
          if (!(along > front.size[2] / 2)) drift.push(`${leaf.id} ход ${s}: ручка не перед лицом (${(along * MM).toFixed(1)} мм)`);
          if (handle.handle?.itemId !== (id === k.ids.left ? KNOB.id : null)) drift.push(`${leaf.id} ход ${s}: на ходу другая ручка`);
        }
      }
    }
    check(
      'H7 кнопка на распашной и условная скоба на подъёмнике: на ходу 0 · ¼ · ½ · ¾ · 1 ручка на том же месте полотна (± 0 мм), перед его лицом, та же позиция',
      poses === 10 && drift.length === 0,
      `положений ${poses} · ${drift.slice(0, 3).join(' | ') || 'расхождений 0'}`,
    );
  }

  /* ── H8. Смета — по позиции каждой детали; общая строка — на остальные ── */
  {
    const k = kitchen();
    const before = k.shown();
    const generic0 = line(before, 'handle_standard')?.quantity ?? 0;
    k.must([
      { op: 'set_fitting', moduleId: k.ids.drawers, slot: 'handle', itemId: BAR.id },
      { op: 'set_fitting', moduleId: k.ids.drawers, slot: 'handle', itemId: KNOB.id, leaf: 'drawer:1' },
      { op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: KNOB.id, leaf: 'door:0' },
    ]);
    const after = k.shown();
    const bar = line(after, `fitting_handle_${BAR.id}`);
    const knob = line(after, `fitting_handle_${KNOB.id}`);
    const generic1 = line(after, 'handle_standard')?.quantity ?? 0;
    const scene = sceneOf(after.run);
    const sceneCount = scene.filter((b) => b.node === 'handle').length;
    /* В сцене — те же позиции на тех же фронтах, что в смете. */
    const onFront = (id: string, leaf: string) => scene.find((b) => b.node === 'handle' && b.part === `${id}:${leaf}`)?.handle?.itemId ?? null;
    const placed = [
      onFront(k.ids.drawers, 'drawer:0'),
      onFront(k.ids.drawers, 'drawer:1'),
      onFront(k.ids.drawers, 'drawer:2'),
      onFront(k.ids.double, 'door:0'),
      onFront(k.ids.double, 'door:1'),
    ];
    const counted = openingHardware(
      allModules(after.run).map((unit, index, all) => ({ unit, heightMm: moduleCarcassHeightMm(unit, after.run), index, total: all.length })),
      after.run,
      cornerOfModule(after.run),
    ).handleBar;
    check(
      'H8 ящики: скоба на модуль, кнопка на ящик 2; дверь 1 двустворчатого — кнопка: в смете скоба 2 шт., кнопка 2 шт. по ценам позиций, накладных −4; в сцене на тех же фронтах те же позиции; ручек в сцене = ручек в счёте',
      bar?.quantity === 2 &&
        knob?.quantity === 2 &&
        Math.round(bar.total) === 2 * 2500 &&
        Math.round(knob.total) === 2 * 1800 &&
        generic0 - generic1 === 4 &&
        JSON.stringify(placed) === JSON.stringify([BAR.id, KNOB.id, BAR.id, KNOB.id, null]) &&
        sceneCount === counted &&
        counted === generic1 + 4,
      `скоба ${bar?.quantity ?? 0} × ${bar?.rate ?? '—'} · кнопка ${knob?.quantity ?? 0} × ${knob?.rate ?? '—'} · накладные ${generic0} → ${generic1} · в сцене ${sceneCount}, в счёте ${counted} · на фронтах ${placed.map((id) => (id === BAR.id ? 'скоба' : id === KNOB.id ? 'кнопка' : 'условная')).join(', ')}`,
    );
  }

  /* ── H9. Отпечаток: ручка детали — другая мебель; снял — прежний ── */
  {
    const k = kitchen();
    const f0 = k.shown().run.fingerprint;
    k.must([{ op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: BAR.id }]);
    const f1 = k.shown().run.fingerprint;
    k.must([{ op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: KNOB.id, leaf: 'door:1' }]);
    const f2 = k.shown().run.fingerprint;
    /* Та же кнопка на другой створке — другая мебель. */
    k.must([
      { op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: null, leaf: 'door:1' },
      { op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: KNOB.id, leaf: 'door:0' },
    ]);
    const f2b = k.shown().run.fingerprint;
    k.must([{ op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: null, leaf: 'door:0' }]);
    const f3 = k.shown().run.fingerprint;
    k.must([{ op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: null }]);
    const f4 = k.shown().run.fingerprint;
    check(
      'H9 отпечаток: ручка модуля — другой; кнопка на двери 2 и та же кнопка на двери 1 — разные; сняли ручку двери — как с ручкой модуля; сняли всё — исходный',
      new Set([f0, f1, f2, f2b]).size === 4 && f3 === f1 && f4 === f0,
      [f0, f1, f2, f2b, f3, f4].join(' → '),
    );
  }

  /* ── H10. Отказы словами: профиль Gola, не помещается, не тот тип ручки ── */
  {
    const k = kitchen();
    const fp = k.shown().run.fingerprint;
    const gola = GOLA ? k.ops([{ op: 'set_fitting', moduleId: k.ids.left, slot: 'handle', itemId: GOLA.id }]) : null;
    /* Скоба 462 на горизонтальной планке двери 450: в свету зазоров 450 − 2 × зазор. */
    k.must([{ op: 'set_handle_spot', moduleId: k.ids.left, turn: 'horizontal' }]);
    const room = 450 - 2 * SHOP.frontGapMm;
    const long = k.ops([{ op: 'set_fitting', moduleId: k.ids.left, slot: 'handle', itemId: LONG_BAR.id }]);
    const lacks = (LONG_BAR.hardware.dimensionsMm?.length ?? 0) - room;
    k.must([{ op: 'set_handle', moduleId: k.ids.right, handle: 'profile' }]);
    const kind = k.ops([{ op: 'set_fitting', moduleId: k.ids.right, slot: 'handle', itemId: BAR.id }]);
    const fpAfter = k.shown().run;
    check(
      `H10 отказы словами, ряд без правки: Gola — «системы без ручек»; скоба 462 на горизонтали двери 450 — «не хватает ${lacks} мм»; у модуля «Профиль» — «сначала выберите «Скоба»»`,
      Boolean(GOLA) &&
        gola!.warnings.length === 1 &&
        /системы без ручек/.test(gola!.warnings[0]) &&
        gola!.shown.run.fingerprint === fp &&
        long.warnings.length === 1 &&
        long.warnings[0].includes(`фасад ${room} мм — не хватает ${lacks} мм`) &&
        kind.warnings.length === 1 &&
        /сначала выберите «Скоба»/.test(kind.warnings[0]) &&
        !(moduleOf(fpAfter, k.ids.left).fittings ?? []).some((f) => f.slot === 'handle') &&
        !(moduleOf(fpAfter, k.ids.right).fittings ?? []).some((f) => f.slot === 'handle'),
      [gola?.warnings[0], long.warnings[0], kind.warnings[0]].map((w) => (w ?? '—').replace(/^.*?» — /, '')).join(' | '),
    );
  }

  /* ── H11. Раскрой ручка не трогает; присадка — словами, без отверстий ── */
  {
    const k = kitchen();
    const plain = buildPanels({ run: k.shown().run, production: SHOP, hardware: CATALOG });
    k.must([
      { op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: BAR.id },
      { op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: KNOB.id, leaf: 'door:1' },
      { op: 'set_fitting', moduleId: k.ids.drawers, slot: 'handle', itemId: EDGE.id },
    ]);
    const run = k.shown().run;
    const fitted = buildPanels({ run, production: SHOP, hardware: CATALOG });
    /* Деталь целиком — номер, размеры, количество, кромка, текстура, лист: ручка в раскрой не входит. */
    const strip = (panels: ReturnType<typeof buildPanels>) => JSON.stringify(panels);
    const drilling = moduleDrilling(moduleOf(run, k.ids.double), run, SHOP, CATALOG).filter((d) => d.slot === 'handle');
    check(
      'H11 детали раскроя с ручками те же до миллиметра; присадка ручек — DRILLING_NOT_VERIFIED, отверстий 0: напечатанные «M4, C 160» к детали не привязаны; у ручки двери — «дверь 2»',
      strip(plain) === strip(fitted) &&
        drilling.length === 2 &&
        drilling.every((d) => d.status === 'DRILLING_NOT_VERIFIED' && d.holes.length === 0) &&
        /* В паспорте ручки присадка напечатана (винты M4, C 160) — к детали она не привязана: отверстий нет. */
        drilling.some((d) => d.missing.some((m) => m.includes('C 160') && m.includes('к детали не привязано'))) &&
        drilling.some((d) => d.title.includes('дверь 2')),
      `деталей ${plain.length} = ${fitted.length}, штук ${plain.reduce((sum, panel) => sum + panel.qty, 0)} = ${fitted.reduce((sum, panel) => sum + panel.qty, 0)} · присадка: ${drilling.map((d) => `${d.title} — ${d.missing[0]?.slice(0, 50)}`).join(' | ')}`,
    );
  }

  /* ── H12. Лёгкая запись Studio даёт ту же модель, что паспорт целиком ── */
  {
    const light = new Set<string>(HARDWARE_LIGHT_FIELDS as readonly string[]);
    const differ: string[] = [];
    for (const fact of handleFacts) {
      const full = handleItemModel(fact);
      const lean = handleItemModel({
        hardware: Object.fromEntries(Object.entries(fact.hardware).filter(([key]) => light.has(key))) as HardwareItem['hardware'],
      });
      if (full.status !== lean.status || full.model?.key !== lean.model?.key || full.model?.finish !== lean.model?.finish) {
        differ.push(fact.hardware.manufacturerArticle ?? fact.article);
      }
    }
    check(
      'H12 лёгкая запись (поля Studio без паспорта) даёт ту же модель, статус и покрытие, что запись целиком, — у 63 из 63',
      differ.length === 0 && light.has('finish'),
      differ.length ? `расходятся: ${differ.slice(0, 5).join(', ')}` : `63 из 63`,
    );
  }

  /* ── H13. Покрытие — у позиции: та же модель другим артикулом, а не краска поверх ── */
  {
    const bronze = handleItemModel(FLUSH_BRONZE).model!;
    const black = handleItemModel(FLUSH_BLACK).model!;
    const bar = handleItemModel(BAR).model!;
    check(
      'H13 врезная 151.38.100 и 151.38.102 — одна модель (ключ сетки тот же), покрытия «бронза PVD» и «чёрный матовый» — из исполнения; скоба 115.52.630 — «нержавеющая шлифованная»',
      bronze.key === black.key && bronze.finish === 'bronze_pvd' && black.finish === 'black_matte' && bar.finish === 'stainless_brushed',
      `${bronze.finish} / ${black.finish} / ${bar.finish}`,
    );
  }

  /* ── H14. Записи до сводки размеров ручек (в базах организаций) — модель по чертежу словами, без падения ── */
  {
    const strip = (item: HardwareItem, keep: string[]): Pick<HardwareItem, 'hardware'> => ({
      hardware: {
        ...item.hardware,
        dimensionsMm: Object.fromEntries(Object.entries(item.hardware.dimensionsMm ?? {}).filter(([key]) => keep.includes(key))),
      },
    });
    const oldBar = handleItemModel(strip(BAR, ['length', 'holeSpacing']));
    const oldKnob = handleItemModel(strip(KNOB, []));
    const oldFlush = handleItemModel(strip(FLUSH_BRONZE, []));
    check(
      'H14 прежняя запись без вылета и диаметра: скоба и кнопка — по чертежу (VISUAL_RECONSTRUCTION), условное названо числом; врезная без диаметров — 3D нет словами',
      oldBar.status === 'VISUAL_RECONSTRUCTION' &&
        oldBar.model!.notes.some((n) => n.includes('диаметр прутка')) &&
        oldBar.model!.notes.some((n) => n.includes('вылет B')) &&
        oldKnob.status === 'VISUAL_RECONSTRUCTION' &&
        oldFlush.status === 'NO_3D' &&
        /не сведены/.test(oldFlush.words),
      `${oldBar.status} (${oldBar.model?.notes.length} заметок) · ${oldKnob.status} · ${oldFlush.words}`,
    );
  }

  /* ── H15. Без позиции — условная скоба; «Профиль» — уголок во всю ширину, приближение словами ── */
  {
    const k = kitchen();
    k.must([{ op: 'set_handle', moduleId: k.ids.right, handle: 'profile' }]);
    const boxes = sceneOf(k.shown().run);
    const profile = handlesOf(boxes, k.ids.right)[0];
    const leaf = leafBox(boxes, `${k.ids.right}:door:0`);
    const generic = handlesOf(boxes, k.ids.left)[0];
    check(
      'H15 «Профиль» — уголок по кромке во всю ширину фасада, VISUAL_APPROXIMATION; дверь без позиции — условная скоба, VISUAL_APPROXIMATION',
      profile?.handle?.model.shape === 'strip' &&
        profile.handle.model.status === 'VISUAL_APPROXIMATION' &&
        Math.abs(profile.handle.model.lengthMm - leaf.scale[0] * MM) < 0.11 &&
        generic?.handle?.model.shape === 'bar' &&
        generic.handle.model.status === 'VISUAL_APPROXIMATION' &&
        generic.handle.itemId === null,
      `профиль ${profile?.handle?.model.lengthMm} мм при фасаде ${(leaf.scale[0] * MM).toFixed(1)} · условная ${generic?.handle?.model.lengthMm} мм`,
    );
  }

  /* ── H16. Одна ручка на деталь: ни на одном фасаде двух ручек нет ── */
  {
    const k = kitchen();
    k.must([
      { op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: BAR.id },
      { op: 'set_fitting', moduleId: k.ids.double, slot: 'handle', itemId: KNOB.id, leaf: 'door:1' },
      { op: 'set_fitting', moduleId: k.ids.drawers, slot: 'handle', itemId: EDGE.id, leaf: 'drawer:0' },
    ]);
    const run = k.shown().run;
    const boxes = sceneOf(run).filter((b) => b.node === 'handle');
    const perPart = new Map<string, number>();
    for (const box of boxes) perPart.set(box.part ?? '', (perPart.get(box.part ?? '') ?? 0) + 1);
    const doubles = Array.from(perPart.entries()).filter(([, n]) => n > 1);
    const leaves = openingHardware(
      allModules(run).map((unit, index, all) => ({ unit, heightMm: moduleCarcassHeightMm(unit, run), index, total: all.length })),
      run,
      cornerOfModule(run),
    ).handleLeaves;
    const counted = Object.values(leaves).reduce((sum, list) => sum + list.length, 0);
    const missing = Object.entries(leaves).flatMap(([id, list]) => list.filter((leaf) => perPart.get(`${id}:${leaf}`) !== 1).map((leaf) => `${id}:${leaf}`));
    check(
      'H16 у каждой детали со штучной ручкой ровно одна ручка в сцене (дублей от прежнего бруска нет): двери 800 — 2, дверцы — по 1, ящики — 3, верхний — 1',
      doubles.length === 0 && missing.length === 0 && boxes.length === counted && counted === 8,
      `ручек ${boxes.length}, деталей в счёте ${counted}, дублей ${doubles.length}, без ручки ${missing.slice(0, 3).join(', ') || 0}`,
    );
  }
}

/* Отдельный запуск: тот же набор, свой счёт. */
if (require.main === module) {
  let passed = 0;
  let failed = 0;
  handleChecks((name, condition, detail = '') => {
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
