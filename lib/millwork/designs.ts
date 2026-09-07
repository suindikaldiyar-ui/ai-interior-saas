import { TYPICAL_PRICE_LIST } from './rates';
import { frontTitle } from './frontMaterial';
import type { RateTable } from './estimate';
import type { CountertopKind, FrontSpec, MillworkOp } from '@/types/millwork';

/**
 * ГОТОВЫЕ ДИЗАЙНЫ.
 *
 * Мебельщик не собирает материал по атрибутам — он показывает клиенту
 * четыре-пять решений, которые уже делал, и называет их словами. «Белая
 * эмаль с кварцем» — это разговор; «MDF enamel / solid / gloss + quartz»
 * — это форма ввода, за которой клиент перестаёт следить.
 *
 * Дизайн связывает в одно имя фасад низа, фасад верха (они могут
 * отличаться), столешницу, фартук и ручки. Один тап кладёт всё на ряд;
 * дальше замерщик правит поштучно, и ручная правка сильнее — она идёт
 * той же операцией `set_front`, только по одному модулю, и применяется
 * после.
 *
 * ССЫЛАЮТСЯ НА КАТАЛОГ ЭТОЙ КОМПАНИИ. Дизайн, для которого у компании нет
 * позиции, недоступен и говорит, КАКОЙ именно не хватает. Подставлять
 * похожую нельзя: клиент подпишет смету на товар, которого компания не
 * продаёт.
 */

export type RunDesign = {
  id: string;
  name: string;
  /** Одна строка о том, кому и зачем. */
  hint: string;
  /** Фасады нижнего ряда и пеналов. */
  lower: FrontSpec;
  /** Фасады верхнего ряда. Совпадает с низом, если дизайн одноцветный. */
  upper: FrontSpec;
  countertop: CountertopKind;
  /** Ручка-профиль вместо накладной. */
  integratedHandles: boolean;
  /**
   * Ставки, без которых дизайн не посчитать. Столешница и фартук — свои
   * строки сметы, фасад — общая статья `front_panel`.
   */
  requires: string[];
};

const H = (hex: string) => hex;

export const RUN_DESIGNS: RunDesign[] = [
  {
    id: 'white-basic',
    name: 'Белый матовый',
    hint: 'самый доступный: ЛДСП, прямые фасады, накладные ручки',
    lower: { base: 'ldsp', construct: 'solid', finish: 'matte', colorHex: H('#EDEAE3') },
    upper: { base: 'ldsp', construct: 'solid', finish: 'matte', colorHex: H('#EDEAE3') },
    countertop: 'ldsp',
    integratedHandles: false,
    requires: ['front_panel', 'countertop_ldsp', 'wall_panel', 'handle_standard'],
  },
  {
    id: 'oak-graphite',
    name: 'Дуб и графит',
    hint: 'низ графитовый, верх под дуб: ходовое сочетание в новостройках',
    lower: { base: 'ldsp', construct: 'solid', finish: 'matte', colorHex: H('#3A3D40') },
    upper: { base: 'ldsp', construct: 'solid', finish: 'textured', colorHex: H('#B79768') },
    countertop: 'ldsp',
    integratedHandles: false,
    requires: ['front_panel', 'countertop_ldsp', 'wall_panel', 'handle_standard'],
  },
  {
    id: 'soft-film',
    name: 'Софт-тач без ручек',
    hint: 'плёночный МДФ и ручка-профиль: гладкий фасад, кромки нет',
    lower: { base: 'mdf_film', construct: 'solid', finish: 'matte', colorHex: H('#8E9285') },
    upper: { base: 'mdf_film', construct: 'solid', finish: 'matte', colorHex: H('#D9D6CE') },
    countertop: 'ldsp',
    integratedHandles: true,
    requires: ['front_panel', 'countertop_ldsp', 'wall_panel', 'handle_integrated'],
  },
  {
    id: 'enamel-gloss',
    name: 'Белая эмаль, глянец',
    hint: 'эмаль и кварц: дорогой вид, кромки на фасаде нет вовсе',
    lower: { base: 'mdf_enamel', construct: 'solid', finish: 'gloss', colorHex: H('#F4F2ED') },
    upper: { base: 'mdf_enamel', construct: 'solid', finish: 'gloss', colorHex: H('#F4F2ED') },
    countertop: 'quartz',
    integratedHandles: true,
    requires: ['front_panel', 'countertop_quartz', 'wall_panel', 'handle_integrated'],
  },
  {
    id: 'classic-framed',
    name: 'Классика с филёнкой',
    hint: 'филёнчатая эмаль и массив: рама и вставка, две детали в раскрое',
    lower: { base: 'mdf_enamel', construct: 'framed', finish: 'matte', colorHex: H('#E4E7E2') },
    upper: { base: 'mdf_enamel', construct: 'framed', finish: 'matte', colorHex: H('#E4E7E2') },
    countertop: 'solid_wood',
    integratedHandles: false,
    requires: ['front_panel', 'countertop_solid_wood', 'wall_panel', 'handle_standard'],
  },
  {
    id: 'acrylic-quartz',
    name: 'Акрил и кварц',
    hint: 'зеркальный глянец акрила: самый заметный блеск в линейке',
    lower: { base: 'acrylic', construct: 'solid', finish: 'gloss', colorHex: H('#2E3338') },
    upper: { base: 'acrylic', construct: 'solid', finish: 'gloss', colorHex: H('#EFF1F2') },
    countertop: 'quartz',
    integratedHandles: true,
    requires: ['front_panel', 'countertop_quartz', 'wall_panel', 'handle_integrated'],
  },
  {
    id: 'veneer-stone',
    name: 'Шпон и камень',
    hint: 'шпон с текстурой и массив: тёплая мебель под дерево',
    lower: { base: 'veneer_solid', construct: 'solid', finish: 'textured', colorHex: H('#9A7449') },
    upper: { base: 'veneer_solid', construct: 'solid', finish: 'textured', colorHex: H('#9A7449') },
    countertop: 'solid_wood',
    integratedHandles: false,
    requires: ['front_panel', 'countertop_solid_wood', 'wall_panel', 'handle_standard'],
  },
  {
    id: 'radius-enamel',
    name: 'Эмаль с радиусом',
    hint: 'гнутые торцевые фасады: скругляют угол ряда, куда упираются коленом',
    lower: { base: 'mdf_enamel', construct: 'radius', finish: 'matte', colorHex: H('#C7CBC4') },
    upper: { base: 'mdf_enamel', construct: 'solid', finish: 'matte', colorHex: H('#E8E9E4') },
    countertop: 'quartz',
    integratedHandles: true,
    requires: ['front_panel', 'countertop_quartz', 'wall_panel', 'handle_integrated'],
  },
];

export type DesignAvailability =
  | { available: true }
  | { available: false; missing: string[]; reason: string };

/**
 * Есть ли у компании всё, из чего собран дизайн.
 *
 * Отказ называет ПОЗИЦИЮ, а не «дизайн недоступен»: замерщик должен знать,
 * что именно завести в каталоге, — иначе он идёт спрашивать нас.
 */
export function designAvailability(
  design: RunDesign,
  rates: RateTable,
): DesignAvailability {
  const missing = design.requires.filter((key) => rates[key] === undefined);
  if (missing.length === 0) return { available: true };

  /*
   * Название позиции берётся из типового прайса — из того же списка,
   * которым каталог и заполняется. Свой словарь названий разошёлся бы
   * с ним на первой же новой статье, и замерщик пошёл бы искать
   * «countertop_quartz» в каталоге, где такой строки нет.
   */
  const names = missing.map(
    (key) => TYPICAL_PRICE_LIST.find((rate) => rate.estimateKey === key)?.name ?? key,
  );
  return {
    available: false,
    missing,
    reason:
      `Нет позиции в каталоге: ${names.join(', ')}. ` +
      'Заведите её — или возьмите дизайн, собранный из того, что есть.',
  };
}

/**
 * Что делает применение дизайна.
 *
 * Обычные операции, ничего своего: тот же `set_front`, которым правят
 * один модуль, и те же `set_option`. Второй путь записи развёл бы
 * отпечаток, а с ним чертёж, смету, раскрой и 3D.
 */
export function designOps(design: RunDesign, upperModuleIds: string[]): MillworkOp[] {
  return [
    { op: 'set_front', moduleId: 'all', front: design.lower },
    ...upperModuleIds.map(
      (moduleId): MillworkOp => ({ op: 'set_front', moduleId, front: design.upper }),
    ),
    { op: 'set_option', key: 'countertop', value: design.countertop },
    { op: 'set_option', key: 'integratedHandles', value: design.integratedHandles },
  ];
}

/** Состав дизайна одной строкой — для карточки и для отчёта. */
export function designSummary(design: RunDesign): string {
  const same = frontTitle(design.lower) === frontTitle(design.upper);
  const fronts = same
    ? frontTitle(design.lower)
    : `низ ${frontTitle(design.lower)}, верх ${frontTitle(design.upper)}`;

  return [
    fronts,
    `столешница ${COUNTERTOP_TITLES[design.countertop]}`,
    design.integratedHandles ? 'ручка-профиль' : 'накладные ручки',
  ].join(' · ');
}

const COUNTERTOP_TITLES: Record<CountertopKind, string> = {
  ldsp: 'ЛДСП',
  quartz: 'кварц',
  solid_wood: 'массив',
};

export function designById(id: string): RunDesign | undefined {
  return RUN_DESIGNS.find((design) => design.id === id);
}
