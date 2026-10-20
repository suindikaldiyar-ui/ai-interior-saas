import type { FrontRelief } from '@/types/millwork';
import { RELIEF_STATUS } from './facadeRelief';
import { layersOfRelief, profileOf } from './milling';

/**
 * МОДЕЛИ МДФ-ФАСАДОВ KIRA — ПОЗИЦИИ КАТАЛОГА ФРЕЗЕРОВОК (P3D-MDF).
 *
 * KIRA делает готовые МДФ-фасады; мебельщик заказывает у неё «СЛ 3 в RAL
 * 7016» и ставит на свой корпус. Второго каталога под них нет (ловушка
 * 19): модель — товар `catalog_items` с `meta.milling`, рядом с типовыми
 * фрезеровками, и ссылается на неё фасад (`FrontSpec.millingId`).
 *
 * ЧТО ИЗВЕСТНО, А ЧТО НЕТ — НАЗВАНО У КАЖДОЙ МОДЕЛИ.
 *
 *   рисунок   — ПРИБЛИЖЕНИЕ, снятое глазом с фото производителя
 *               (`relief`, VISUAL_ONLY): тип и параметры в мм, которые
 *               правдоподобно выглядят на встрече. Это НЕ заводская
 *               CNC-геометрия: чертежа фрезы, глубины и шага у нас нет.
 *   размеры   — заводских нет (`missing`). Подтверждено ровно то, что
 *               напечатано на странице модели (`confirmed`).
 *   цена      — нет: позиция без цены, «цена не задана» (ловушка 452).
 *   фото      — референс лежит в CATALOG_STAGING (вне git), права не
 *               подтверждены: не публикуется и на фасад не ложится.
 *
 * В базу организаций модели не заводятся сами: импорт в рабочую базу —
 * после отдельного разрешения владельца. Здесь — строки каталога той же
 * формы, что у типовых фрезеровок, и они есть в демо-каталоге.
 */

export const KIRA_MANUFACTURER = 'KIRA';

/** Чего у модели нет — имена полей карточки производителя (CATALOG_STAGING/…/product.json). */
const MISSING = [
  'panelThicknessMm',
  'borderOffsetMm',
  'frameWidthMm',
  'millingDepthMm',
  'groovePitchMm',
  'grooveWidthMm',
  'edgeRadiusMm',
  'profileDrawing',
  'priceKzt',
] as const;

export type KiraModel = {
  /** Артикул производителя: «SL-3». */
  article: string;
  /** Как модель названа на странице производителя. */
  name: string;
  source: string;
  /** Тип рисунка словами — классификация по фото, на глаз. */
  pattern: string;
  /** Приближение рисунка (VISUAL_ONLY). */
  relief: FrontRelief;
  /** Что напечатано на странице модели — как есть, без толкования. */
  confirmed: Record<string, string>;
  /** Чего приближение не воспроизводит — словами. */
  notReproduced?: string;
};

export const KIRA_MODELS: KiraModel[] = [
  {
    article: 'SL-3',
    name: 'СЛ 3',
    source: 'https://kira-group.kz/testtesttest/tproduct/467998039012-sl-3',
    pattern: 'рамка с профилем, поле утоплено',
    relief: { kind: 'frame', insetMm: 60, widthMm: 14, depthMm: 4 },
    confirmed: {},
    notReproduced: 'внутренний кант по полю',
  },
  {
    article: 'SL-5',
    name: 'СЛ 5',
    source: 'https://kira-group.kz/testtesttest/tproduct/544273232712-sl-5',
    pattern: 'тонкий контур по периметру',
    relief: { kind: 'grooves', insetMm: 50, count: 1, widthMm: 6, depthMm: 2 },
    confirmed: {},
  },
  {
    article: 'SL-6',
    name: 'СЛ 6',
    source: 'https://kira-group.kz/testtesttest/tproduct/620678998432-sl-6',
    pattern: 'рамка со скосом',
    relief: { kind: 'frame', insetMm: 55, widthMm: 20, depthMm: 4 },
    confirmed: {},
  },
  {
    article: 'SL-7',
    name: 'СЛ 7',
    source: 'https://kira-group.kz/testtesttest/tproduct/964339024692-sl-7',
    pattern: 'ступенчатая рамка в три контура',
    relief: { kind: 'grooves', insetMm: 40, count: 3, pitchMm: 26, widthMm: 8, depthMm: 3 },
    confirmed: {},
    notReproduced: 'выпуклые ступени — показаны канавками',
  },
  {
    article: 'SL-8',
    name: 'СЛ 8',
    source: 'https://kira-group.kz/testtesttest/tproduct/422213803702-sl-8',
    pattern: 'вложенные рамки',
    relief: { kind: 'grooves', insetMm: 45, count: 3, pitchMm: 20, widthMm: 6, depthMm: 2.5 },
    confirmed: {},
    notReproduced: 'выпуклые ступени — показаны канавками',
  },
  {
    article: 'SL-9',
    name: 'СЛ 9',
    source: 'https://kira-group.kz/testtesttest/tproduct/601245190352-sl-9',
    pattern: 'рамка с широким скосом',
    relief: { kind: 'frame', insetMm: 45, widthMm: 24, depthMm: 5 },
    confirmed: {},
  },
  {
    article: 'SL-10',
    name: 'СЛ 10',
    source: 'https://kira-group.kz/testtesttest/tproduct/849795640602-sl-10',
    pattern: 'гладкое поле, пояс рифления снизу',
    relief: { kind: 'fluted', pitchMm: 14, widthMm: 10, depthMm: 2.5, zoneMm: 120 },
    /* Страница модели: «Характеристика: 16 мм» — напечатано, к чему относится, не сказано. */
    confirmed: { characteristicRaw: '16 мм' },
    notReproduced: 'тонкий контур по верху и бокам поля',
  },
  {
    article: 'SL-11',
    name: 'СЛ 11',
    source: 'https://kira-group.kz/viborka/tproduct/398225154854-sl-11',
    pattern: 'тонкий контур у самого края',
    relief: { kind: 'grooves', insetMm: 22, count: 1, widthMm: 5, depthMm: 1.5 },
    confirmed: {},
  },
  {
    article: 'SL-12',
    name: 'СЛ 12',
    source: 'https://kira-group.kz/testtesttest/tproduct/484706748942-sl-12',
    pattern: 'узкая рамка с профилем',
    relief: { kind: 'frame', insetMm: 55, widthMm: 12, depthMm: 3 },
    confirmed: {},
  },
  {
    article: 'SL-13',
    name: 'СЛ 13',
    source: 'https://kira-group.kz/testtesttest/tproduct/482564429734-sl-13',
    pattern: 'рамка с кантом',
    relief: { kind: 'frame', insetMm: 40, widthMm: 14, depthMm: 4 },
    confirmed: {},
    notReproduced: 'кант по внешнему краю рамки',
  },
  {
    article: 'SL-14',
    name: 'СЛ 14',
    source: 'https://kira-group.kz/testtesttest/tproduct/286837067242-sl-14',
    pattern: 'частые вложенные контуры',
    relief: { kind: 'grooves', insetMm: 20, count: 10, pitchMm: 14, widthMm: 6, depthMm: 2 },
    confirmed: {},
    notReproduced: 'сходящиеся к низу дуги — показаны прямоугольными контурами',
  },
];

/** Ключ модели в рисунке фасада: «KIRA:SL-3». */
export function kiraModelKey(model: Pick<KiraModel, 'article'>): string {
  return `${KIRA_MANUFACTURER}:${model.article}`;
}

/**
 * МОДЕЛЬ В ВИДЕ ТОВАРА КАТАЛОГА — той же формы, что `typicalMillingItem`.
 *
 * Цены нет — ноль «цена не задана». Происхождение и статусы — в
 * `meta.provenance`: производитель, артикул, страница, фото-референс
 * (путь и статус, без картинки), тип рисунка, визуальный и инженерный
 * статусы, подтверждённое и отсутствующее.
 */
export function kiraMillingItem(model: KiraModel) {
  const relief: FrontRelief = { ...model.relief, model: kiraModelKey(model) };
  const layers = layersOfRelief(relief);
  return {
    article: `KIRA-${model.article}`,
    name_ru: `KIRA ${model.name}`,
    name_kk: `KIRA ${model.name}`,
    price: 0,
    unit: 'm2' as const,
    categoryKey: 'materials',
    meta: {
      milling: { profile: profileOf(layers), layers, typical: false, relief },
      provenance: {
        manufacturer: KIRA_MANUFACTURER,
        article: model.article,
        name: model.name,
        source: model.source,
        referencePhoto: {
          path: `CATALOG_STAGING/99_IMPORT_QUEUE/KIRA/KIRA_${model.article}.png`,
          status: 'REFERENCE_ONLY',
        },
        rightsStatus: 'NOT_VERIFIED',
        patternType: model.pattern,
        patternClassification: 'PROVISIONAL_VISUAL_CLASSIFICATION',
        visualStatus: RELIEF_STATUS,
        engineeringStatus: 'MISSING_DATA',
        confirmed: model.confirmed,
        missing: [...MISSING],
        ...(model.notReproduced ? { notReproduced: model.notReproduced } : {}),
      },
    },
  };
}
