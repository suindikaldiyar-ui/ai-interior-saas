import facts from '@/data/catalog/appliances.json';
import type { ApplianceKind, Module } from '@/types/millwork';

/**
 * ТЕХНИКА ПРОИЗВОДИТЕЛЯ — МОДЕЛЬ С АРТИКУЛОМ, А НЕ «ВАРОЧНАЯ 600»
 * (PROFESSIONAL APPLIANCES, ЭТАП 3).
 *
 * Факты — `data/catalog/appliances.json`: размеры и ниши из карточки
 * bosch-home.com/kz/ru, монтажные правила — из инструкции с номером,
 * страницей и рисунком. Сверяет файл с сохранёнными карточками
 * `scripts/appliance-facts.mjs`. Ничего здесь не придумано: чего нет в
 * документе, того нет в записи, и проверка это называет.
 *
 * Модель — выбор КУХНИ (`RunRequirements.applianceModels`, как тип прибора
 * слоя 43): прибор принадлежит кухне, а не ряду (слой 42). Модулю её кладёт
 * раскладка (`Module.applianceModels`) — только выбранную; без выбора модуль
 * прежний до байта, и отпечатки сохранённых кухонь не едут (ловушка 246).
 */

export type CookingZone = {
  diameterMm: number;
  kw: number;
  boostKw?: number;
  /** Центр зоны от заднего левого угла панели, мм: [вдоль, вглубь]. */
  atMm: [number, number];
  wok?: boolean;
};

export type WorktopDepthRule = { fromMm: number; toMm: number | null; backMm?: number; backMinMm?: number; frontMinMm: number };

export type HobInstall = {
  cutoutWidthMm: [number, number];
  cutoutDepthMm: [number, number];
  cutoutRadiusMm: [number, number] | null;
  /** На сколько панель уходит вниз от поверхности столешницы. */
  builtInDepthMm: number;
  worktopMinMm: number;
  worktopMaxMm?: number;
  /** От выреза до стены или пенала сбоку. */
  sideMinMm: number;
  backMinMm?: number;
  frontMinMm?: number;
  worktopDepthMinMm?: number;
  worktopDepths?: WorktopDepthRule[];
  overOven: {
    /** Индукция: от поверхности столешницы до верха передней панели духового шкафа. */
    worktopToOvenFrontMinMm?: number;
    /** Газ: от поверхности столешницы до верха корпуса духового шкафа под штуцером. */
    worktopToOvenRearMinMm?: number;
    hobToOvenMinMm: number;
    ovenNeedsFan: boolean;
  };
  hoodMinMm?: number;
  wallCabinetsAboveHobMinMm?: number;
  wallCabinetsAboveWorktopMinMm?: number;
  worktopFromFloorMinMm?: number;
  notAbove: ApplianceKind[];
  backAirGapMinMm?: number;
  furnitureTempMinC?: number;
  /** Внутренняя ширина корпуса меньше этой — в боковинах нужны пазы. */
  sideSlotsBelowInnerWidthMm?: number;
  gas?: { thread: string; connectorDownMm: number; connectorFromBackMm: number };
};

export type OvenInstall = {
  bodyFrontMm: { height: number; depth: number };
  bodyRearHeightMm: number;
  frameMm: number;
  panelHeightMm: number;
  handleMaxMm: number;
  volumeL: number;
  coolingFan: boolean;
  softClose: boolean;
  underWorktop: { nicheHeightMm: [number, number]; nicheWidthMm: [number, number]; nicheDepthMinMm: number; backAirGapMinMm: number; worktopDepthMinMm: number };
  column: { nicheHeightMm: [number, number]; nicheHeightNominalMm: number; nicheWidthMm: [number, number]; nicheDepthMinMm: number; backAirGapMinMm: number };
  sideGapMinMm: number;
  furnitureTempMinC: number;
  frontsTempMinC: number;
};

export type ApplianceDoc = { id: string; url: string; title: string; pages: string };
export type ApplianceRule = { id: string; doc: string; page: number | null; figure?: string; text: string };

export type ApplianceModel = {
  article: string;
  brand: string;
  kind: ApplianceKind;
  type: string;
  series: string;
  name: string;
  url: string;
  gtin: string;
  /** Розница карточки на дату проверки — справка, не ставка сметы. */
  priceKzt: number | null;
  sizeMm: { height: number; width: number; depth: number };
  colour: string;
  surface: string;
  frame: string;
  controls: string;
  powerW: number | null;
  cooking?: CookingZone[];
  controlsAtMm?: [number, number];
  knobsAtMm?: { y: number; x: number[]; diameterMm: number };
  grates?: number;
  hob?: HobInstall;
  oven?: OvenInstall;
  docs: ApplianceDoc[];
  rules: ApplianceRule[];
  /** Чем модель нарисована и что в ней условно — словами. */
  visual: string;
};

type FactsFile = { checkedAt: string; source: string; note: string; models: ApplianceModel[] };

/**
 * ЗАПИСЬ ПРОВЕРЯЕТСЯ НА ВХОДЕ. Модель без размеров, без документа или с
 * вырезом «от большего к меньшему» — ошибка файла фактов, а не тихое
 * «модели нет»: молча выпавшая модель исчезла бы из выбора без причины.
 */
function checked(file: FactsFile): ApplianceModel[] {
  const seen = new Set<string>();
  for (const m of file.models) {
    const where = `appliances.json: ${m.article}`;
    if (!m.article || seen.has(m.article)) throw new Error(`${where} — артикул пустой или повторяется`);
    seen.add(m.article);
    const { height, width, depth } = m.sizeMm ?? ({} as ApplianceModel['sizeMm']);
    if (!(height > 0 && width > 0 && depth > 0)) throw new Error(`${where} — нет габарита`);
    if (!m.docs?.length || !m.rules?.length) throw new Error(`${where} — нет документа монтажа или правил`);
    for (const rule of m.rules) if (!m.docs.some((d) => d.id === rule.doc)) throw new Error(`${where} — правило «${rule.id}» ссылается на документ ${rule.doc}, которого в записи нет`);
    if (m.kind === 'hob') {
      const h = m.hob;
      if (!h) throw new Error(`${where} — у варочной нет монтажа`);
      const ordered = (r: [number, number] | null) => !r || (r[0] > 0 && r[0] <= r[1]);
      if (!ordered(h.cutoutWidthMm) || !ordered(h.cutoutDepthMm) || !ordered(h.cutoutRadiusMm)) throw new Error(`${where} — вырез задан не «от меньшего к большему»`);
    }
    if (m.kind === 'oven' && !m.oven) throw new Error(`${where} — у духового шкафа нет монтажа`);
  }
  return file.models;
}

const FILE = facts as unknown as FactsFile;
export const APPLIANCE_MODELS: ApplianceModel[] = checked(FILE);
export const APPLIANCE_FACTS_CHECKED_AT: string = FILE.checkedAt;

export function applianceModel(article: string | null | undefined): ApplianceModel | null {
  if (!article) return null;
  return APPLIANCE_MODELS.find((m) => m.article === article) ?? null;
}

/** Модели для вида прибора — в порядке файла фактов. */
export function modelsFor(kind: ApplianceKind): ApplianceModel[] {
  return APPLIANCE_MODELS.filter((m) => m.kind === kind);
}

/** Модель прибора в этом модуле — только выбранная. */
export function unitModel(unit: Pick<Module, 'applianceModels'>, kind: ApplianceKind): ApplianceModel | null {
  return applianceModel(unit.applianceModels?.[kind]);
}

/** «инструкция 9001867766, с. 10, рис. 7.5» — откуда правило. */
export function ruleSource(model: ApplianceModel, id: string): string {
  const rule = model.rules.find((r) => r.id === id);
  if (!rule) return `${model.brand} ${model.article}`;
  const doc = model.docs.find((d) => d.id === rule.doc);
  const what = doc && /чертёж/i.test(doc.title) ? 'чертёж карточки' : 'инструкция';
  return `${what} ${rule.doc}${rule.page ? `, с. ${rule.page}` : ''}${rule.figure ? `, рис. ${rule.figure}` : ''}`;
}

/** «Bosch PUE611BB5E» */
export function modelTitle(model: ApplianceModel): string {
  return `${model.brand} ${model.article}`;
}

/** Розница карточки словами: «229 990 ₸ на 29.10.2026, bosch-home.com/kz — справочно». */
export function retailWords(model: ApplianceModel): string {
  if (model.priceKzt === null) return 'розничной цены в карточке нет';
  const [y, m, d] = APPLIANCE_FACTS_CHECKED_AT.split('-');
  return `розница ${model.priceKzt.toLocaleString('ru-RU').replace(/ /g, ' ')} ₸ на ${d}.${m}.${y}, bosch-home.com/kz — справочно`;
}
