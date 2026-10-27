/**
 * ТРИ ЭТАЛОННЫЕ КУХНИ ВЛАДЕЛЬЦА (Measurement 2.0, часть 3.3) — ПАРАМЕТРИЧЕСКИЕ, А НЕ СЦЕНЫ.
 *
 * Каждая собрана тем же путём, что собирает человек на экране: замер →
 * готовое решение (`buildFromSurvey` — путь экрана) → правки операциями
 * (`applyOps`): антресоль на стенах (`set_mezzanine`), «в линию с высоким
 * блоком» (`alignTall`), материалы — `materialOps`, та же функция, что у
 * панели «Материалы» (цели «Фасады всей кухни» и «Выбранный модуль»).
 * Своей арифметики здесь нет: кухня — это `MillworkState`, который потом
 * открывается и правится, как любой объект.
 *
 * Материалы — позиции каталога материалов (`data/catalog/catalog.json`):
 * RAL Design (эмаль) и EGGER (ЛДСП, древесный декор). Идентификатор позиции
 * здесь — `@MAT:<артикул>`: в организации он свой, и браузерная приёмка
 * подставляет его после загрузки тех же коллекций (`materialArticles`).
 * Смета кухни — с этими позициями в каталоге, как у организации, которая
 * загрузила коллекции (`KITCHEN_MATERIAL_ITEMS` → `objectInput`, путь
 * экрана): цены у них в файле нет, поэтому строки фасадов — «цена не
 * задана», и итог неполный (слой 51). Без каталога те же фасады ушли бы в
 * общую строку по ставке цеха — это смета другой организации.
 *
 *   k1 — Г 3600 + 2800: серые нижние, белые верхние фасады, серая антресоль
 *        по двум стенам, пенал «духовка + СВЧ», холодильник; единая верхняя
 *        композиция — верх рядов, антресоль и кладовка над холодильником на
 *        одной отметке (2400), верх всего — 2700;
 *   k2 — Г 3400 + 2600: серые нижние, белые верхние и антресоль по двум
 *        стенам; глубины верхних уровней разные (верх 300, антресоль 400 —
 *        отметки объекта); угол низа ведёт стена А, угол антресоли — стена Б:
 *        антресоль поставлена при «ведёт А» и переведена к стене Б карточкой
 *        угла «Антресоль: Стена Б идёт в угол» (`cornerOwnerCards`);
 *   k3 — прямая 4200: зелёно-синие фасады (RAL 190 40 15), антресоль над
 *        рабочей зоной в линию с высоким блоком, высокие секции — древесный
 *        декор EGGER H1145 (рисунок дерева демонстрационный и так назван).
 */
import catalogFile from '../data/catalog/catalog.json';
import { DEFAULT_PRODUCTION, type ProductionOverrides, type ProductionSettings } from '../types/catalog';
import type { CompositionKind, Module, Run, RunRequirements, SavedCornerChoice } from '../types/millwork';
import type { Survey } from '../types/survey';
import type { MillworkState } from '../lib/projects';
import { applyOps } from '../lib/millwork/ops';
import { productionFor } from '../lib/millwork/shop';
import { mezzanineBaseOf } from '../lib/millwork/fill';
import { hasFacade } from '../lib/millwork/applianceFront';
import { cornerOwnerCards, type CornerCard } from '../lib/millwork/cornerChange';
import {
  catalogEntriesFromRows,
  materialDefs,
  materialCatalog,
  materialItemOf,
  materialOps,
  parseMaterialFile,
  planMaterialImport,
  type MaterialChoice,
  type MaterialTarget,
} from '../lib/millwork/materialCatalog';
import { buildFromSurvey, surveyOf, type BuildSpec, type Built } from './measurement-v2-fixture';

/** Коллекции каталога материалов, из которых взяты позиции кухонь. */
export const KITCHEN_COLLECTIONS = ['ral-design', 'egger-ldsp'] as const;
/** Метка идентификатора позиции до загрузки в организацию. */
export const MATERIAL_ID_PREFIX = '@MAT:';

const file = parseMaterialFile(catalogFile);
const defs = materialDefs(file);
const entries = catalogEntriesFromRows(
  planMaterialImport(file, [], { collections: [...KITCHEN_COLLECTIONS] }).rows,
  file,
  'reference',
  MATERIAL_ID_PREFIX,
);
/** Позиции коллекций кухонь строками каталога — как их читает организация после загрузки. */
export const KITCHEN_CATALOG = entries;
/** Те же позиции глазами сметы и сцены (`materialCatalog`) — их экран кладёт в `objectInput`. */
export const KITCHEN_MATERIAL_ITEMS = materialCatalog(entries);
/** Сборка кухни путём экрана — с каталогом материалов организации. */
const build = (spec: BuildSpec): Built => buildFromSurvey({ ...spec, materials: KITCHEN_MATERIAL_ITEMS });

/** Позиция каталога материалов — как её выбирает панель «Материалы». */
function choice(collection: (typeof KITCHEN_COLLECTIONS)[number], article: string, surface: string): MaterialChoice {
  const entry = entries.find((item) => item.article === article);
  if (!entry) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции «${article}» в каталоге материалов нет`);
  const item = materialItemOf(entry);
  if (!item) throw new Error(`«${article}» — не позиция коллекции`);
  const def = defs.collections.find((c) => c.id === collection);
  if (!def) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: коллекции «${collection}» нет`);
  return { item, collection: def, surface };
}

export const KITCHEN_MATERIALS = {
  grey: choice('ral-design', 'RAL 000 55 00', 'matte'),
  white: choice('ral-design', 'RAL 000 90 00', 'matte'),
  teal: choice('ral-design', 'RAL 190 40 15', 'matte'),
  wood: choice('egger-ldsp', 'EGGER-H1145-ST10', 'wood_texture'),
};

/** Артикулы, которые браузерная приёмка ищет в организации после загрузки коллекций. */
export function materialArticles(): string[] {
  return Object.values(KITCHEN_MATERIALS).map((item) => item.item.code);
}

/** Материал на цель панели «Материалы»: `fronts` — вся стена, `module` — перечисленные модули по одному. */
function paint(run: Run, requirements: RunRequirements, target: MaterialTarget, material: MaterialChoice, ids: string[] = []): Run {
  if (target !== 'module') {
    const planned = materialOps(target, material, run, null, defs.finishes);
    if ('refusal' in planned) throw new Error(`${run.wallId}: ${planned.refusal}`);
    return applyOps({ run, requirements, ops: planned.ops });
  }
  let out = run;
  for (const id of ids) {
    const planned = materialOps('module', material, out, id, defs.finishes);
    if ('refusal' in planned) throw new Error(`${id}: ${planned.refusal}`);
    out = applyOps({ run: out, requirements, ops: planned.ops });
  }
  return out;
}

/** Модули висящих рядов стены. */
export const hangingOf = (run: Run): Module[] => run.upperSegments.flatMap((segment) => segment.modules);
/** Шкафы верхнего ряда с фасадом (не антресоль). */
export const uppersOf = (run: Run): Module[] => hangingOf(run).filter((m) => m.section !== 'mezzanine' && hasFacade(m));
/** Антресоль над верхним рядом (не кладовка над колонной). */
export const mezzOf = (run: Run): Module[] => hangingOf(run).filter((m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run) === null);
/** Кладовка над колонной холодильника. */
export const storesOf = (run: Run): Module[] => hangingOf(run).filter((m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run) !== null);
/** Высокий блок: пеналы и кладовки над ними. */
export const tallBlockOf = (run: Run): Module[] => [...run.modules.filter((m) => m.kind === 'tall'), ...storesOf(run)].filter((m) => hasFacade(m));

const kitchenRequirements = (appliances: RunRequirements['appliances'], toCeiling: boolean): RunRequirements => ({
  appliances,
  tallSide: 'left',
  options: {
    hasUpper: true,
    upperToCeiling: toCeiling,
    hardwareClass: 'standard',
    countertop: 'ldsp',
    hasCornice: false,
    integratedHandles: false,
  },
  lockedOptions: ['upperToCeiling'],
});

export type ReferenceKitchen = {
  key: 'k1' | 'k2' | 'k3';
  title: string;
  /** Что с фотографии владельца она повторяет — словами. */
  photo: string;
  survey: Survey;
  shape: CompositionKind;
  requirements: RunRequirements;
  corners?: SavedCornerChoice[];
  /** Отметки объекта (`MillworkState.production`). */
  overrides?: ProductionOverrides;
  production: ProductionSettings;
  /** Правленые ряды: стена А и соседние — как их держит объект. */
  working: Run;
  wallRuns: Record<string, Run>;
  /** То, что откроет экран, — путём экрана. */
  built: Built;
  /** Ряд стены, на которой антресоль встаёт в линию с высоким блоком, — без режима (браузер включает его кнопкой). */
  alignWall?: { wallId: string; before: Run };
  /**
   * Кухня до смены владельца угла антресоли (её ведёт стена А) и карточка
   * «Антресоль: Стена Б идёт в угол» — браузер нажимает её сам; `fresh` —
   * антресоль, собранная сразу при «ведёт стена Б», для сверки.
   */
  ownerChange?: {
    corners: SavedCornerChoice[];
    working: Run;
    wallRuns: Record<string, Run>;
    built: Built;
    card: CornerCard;
    fresh: Built;
  };
};

/** Объект кухни так, как его держит база (`projects.millwork`). */
export function kitchenState(
  kitchen: ReferenceKitchen,
  runs?: { working: Run; wallRuns: Record<string, Run>; corners?: SavedCornerChoice[] },
): MillworkState {
  const working = runs?.working ?? kitchen.working;
  const wallRuns = runs?.wallRuns ?? kitchen.wallRuns;
  const corners = runs?.corners ?? kitchen.corners;
  return {
    survey: kitchen.survey,
    templateId: null,
    requirements: kitchen.requirements,
    selectedVariant: 'optimal',
    shape: kitchen.shape,
    ...(corners ? { corners } : {}),
    ...(kitchen.overrides ? { production: kitchen.overrides } : {}),
    runs: { optimal: working },
    ...(Object.keys(wallRuns).length > 0 ? { wallRuns } : {}),
  } as MillworkState;
}

function kitchen1(): ReferenceKitchen {
  const survey = surveyOf([{ length: 3600, run: true }, { length: 2800 }], { ceiling: 2700 });
  const requirements = kitchenRequirements(['fridge', 'oven', 'microwave', 'sink600', 'dishwasher60', 'hob', 'hood'], true);
  const corners: SavedCornerChoice[] = [{ walls: ['w1', 'w2'], lower: 'blind', upper: 'blind', mezzanine: 'blind', owners: { mezzanine: 'prev' } }];
  const template = build({ title: 'Кухня 1', survey, shape: 'corner_l', requirements, corners });
  if (template.refusal) throw new Error(`Кухня 1: ${template.refusal}`);
  const [a0, b0] = template.segments;
  /* Стена Б — с холодильником: антресоль в линию с кладовкой над ним; стена А — той же высоты числом. */
  const withMezzB = applyOps({ run: b0, requirements, ops: [{ op: 'set_mezzanine', heightMm: 300 }] });
  const alignedB = applyOps({ run: withMezzB, requirements, ops: [{ op: 'set_mezzanine', heightMm: 300, alignTall: true }] });
  let a = applyOps({ run: a0, requirements, ops: [{ op: 'set_mezzanine', heightMm: 300 }] });
  let b = alignedB;
  a = paint(a, requirements, 'fronts', KITCHEN_MATERIALS.grey);
  b = paint(b, requirements, 'fronts', KITCHEN_MATERIALS.grey);
  a = paint(a, requirements, 'module', KITCHEN_MATERIALS.white, uppersOf(a).map((m) => m.id));
  b = paint(b, requirements, 'module', KITCHEN_MATERIALS.white, uppersOf(b).map((m) => m.id));
  const built = build({ title: 'Кухня 1', survey, shape: 'corner_l', requirements, corners, working: a, editedWalls: { w2: b } });
  if (built.refusal) throw new Error(`Кухня 1: ${built.refusal}`);
  return {
    key: 'k1',
    title: 'Кухня 1 · Г 3600 + 2800',
    photo: 'серые нижние шкафы, белые верхние фасады, серая антресоль по двум стенам, пенал с духовкой и микроволновкой, холодильник, единая верхняя композиция',
    survey,
    shape: 'corner_l',
    requirements,
    corners,
    production: DEFAULT_PRODUCTION,
    working: a,
    wallRuns: { w2: b },
    built,
  };
}

function kitchen2(): ReferenceKitchen {
  const survey = surveyOf([{ length: 3400, run: true }, { length: 2600 }], { ceiling: 2700 });
  const requirements = kitchenRequirements(['fridge', 'sink600', 'dishwasher45', 'hob', 'hood'], true);
  const overrides: ProductionOverrides = { depths: { upperMm: 300, mezzanineMm: 400 } };
  const production = productionFor(DEFAULT_PRODUCTION, overrides);
  /* Низ ведёт стена А, антресоль — стена Б: углы уровней у разных владельцев. */
  const cornerOf = (mezzanine: 'prev' | 'next'): SavedCornerChoice => ({
    walls: ['w1', 'w2'],
    lower: 'blind',
    upper: 'blind',
    mezzanine: 'blind',
    owners: { mezzanine },
  });
  /* Антресоль на обеих стенах, серые нижние, белые верх и антресоль — при данном владельце угла антресоли. */
  const dressed = (owner: 'prev' | 'next') => {
    const corners = [cornerOf(owner)];
    const template = build({ title: 'Кухня 2', survey, shape: 'corner_l', requirements, corners, production });
    if (template.refusal) throw new Error(`Кухня 2: ${template.refusal}`);
    let [a, b] = template.segments.map((run) => applyOps({ run, requirements, ops: [{ op: 'set_mezzanine', heightMm: 400 }] }));
    a = paint(a, requirements, 'fronts', KITCHEN_MATERIALS.grey);
    b = paint(b, requirements, 'fronts', KITCHEN_MATERIALS.grey);
    a = paint(a, requirements, 'module', KITCHEN_MATERIALS.white, [...uppersOf(a), ...mezzOf(a)].filter((m) => hasFacade(m)).map((m) => m.id));
    b = paint(b, requirements, 'module', KITCHEN_MATERIALS.white, [...uppersOf(b), ...mezzOf(b)].filter((m) => hasFacade(m)).map((m) => m.id));
    const built = build({ title: 'Кухня 2', survey, shape: 'corner_l', requirements, corners, production, working: a, editedWalls: { w2: b } });
    if (built.refusal) throw new Error(`Кухня 2: ${built.refusal}`);
    return { corners, a, b, built };
  };

  /*
   * Как это делает человек: антресоль поставлена при «ведёт стена А», затем
   * «Соединить в углу» → «Антресоль: Стена Б идёт в угол» — карточка угла
   * (`cornerOwnerCards`, путь экрана), её ряды и её выбор.
   */
  const before = dressed('prev');
  const card = cornerOwnerCards({
    runs: before.built.segments,
    index: 0,
    corners: before.built.layout!.corners.map((corner) => corner.choice),
    requirements,
    wallOpenings: [[], []],
    labels: ['Стена А', 'Стена Б'],
  }).find((item) => item.key === 'owner:mezzanine:next');
  if (!card || card.refusal || !card.runs) throw new Error(`Кухня 2: карточки «Антресоль: Стена Б идёт в угол» нет — ${card?.refusal ?? 'нет карточки'}`);
  const corners = [cornerOf('next')];
  const [a, b] = card.runs;
  const built = build({ title: 'Кухня 2', survey, shape: 'corner_l', requirements, corners, production, working: a, editedWalls: { w2: b } });
  if (built.refusal) throw new Error(`Кухня 2: ${built.refusal}`);
  return {
    key: 'k2',
    title: 'Кухня 2 · Г 3400 + 2600',
    photo: 'серые нижние шкафы, белые верхние шкафы, верхняя антресоль по двум стенам, разные глубины верхних уровней, аккуратное угловое соединение',
    survey,
    shape: 'corner_l',
    requirements,
    corners,
    overrides,
    production,
    working: a,
    wallRuns: { w2: b },
    built,
    ownerChange: { corners: before.corners, working: before.a, wallRuns: { w2: before.b }, built: before.built, card, fresh: dressed('next').built },
  };
}

function kitchen3(): ReferenceKitchen {
  const survey = surveyOf([{ length: 4200, run: true }], { ceiling: 2700 });
  const requirements = kitchenRequirements(['fridge', 'oven', 'microwave', 'sink600', 'dishwasher60', 'hob', 'hood'], true);
  const template = build({ title: 'Кухня 3', survey, shape: 'linear', requirements });
  if (template.refusal) throw new Error(`Кухня 3: ${template.refusal}`);
  let before = applyOps({ run: template.segments[0], requirements, ops: [{ op: 'set_mezzanine', heightMm: 400 }] });
  before = paint(before, requirements, 'fronts', KITCHEN_MATERIALS.teal);
  before = paint(before, requirements, 'module', KITCHEN_MATERIALS.wood, tallBlockOf(before).map((m) => m.id));
  /* «В линию с высоким блоком» — той же операцией, что кнопка блока «Антресоль». */
  const aligned = applyOps({ run: before, requirements, ops: [{ op: 'set_mezzanine', heightMm: 400, alignTall: true }] });
  const built = build({ title: 'Кухня 3', survey, shape: 'linear', requirements, working: aligned });
  if (built.refusal) throw new Error(`Кухня 3: ${built.refusal}`);
  return {
    key: 'k3',
    title: 'Кухня 3 · прямая 4200',
    photo: 'зелёно-синие фасады, антресоль над рабочей зоной, высокие мебельные секции, древесная текстура, антресоль соединена с высоким блоком',
    survey,
    shape: 'linear',
    requirements,
    production: DEFAULT_PRODUCTION,
    working: aligned,
    wallRuns: {},
    built,
    alignWall: { wallId: 'w1', before },
  };
}

/** Три кухни — каждый вызов собирает их заново (чистые функции, тот же результат). */
export function referenceKitchens(): ReferenceKitchen[] {
  return [kitchen1(), kitchen2(), kitchen3()];
}
