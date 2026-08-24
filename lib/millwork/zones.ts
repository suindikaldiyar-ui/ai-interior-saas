import type { DoorSystem, SectionKind, ZoneKind } from '@/types/millwork';

/**
 * Зоны квартиры.
 *
 * Каждая зона — это свои габариты, свой состав секций и свой набор статей
 * сметы. Общего у них ровно столько, сколько общего у корпусной мебели:
 * ЛДСП, кромка, петли, опоры. Всё остальное различается, и делать вид, что
 * шкаф-купе это кухня без столешницы, нельзя — в нём другая глубина, другие
 * двери и другие деньги.
 *
 * `ready: false` значит «зона просчитана не до конца», и карточка выбора
 * говорит об этом прямо.
 */

export type ZoneProfile = {
  kind: ZoneKind;
  title: string;
  /** Глубина корпуса, мм. */
  depthMm: number;
  /** Высота ряда: число в мм либо «до потолка». */
  height: number | 'ceiling';
  /** Что за мебель тут стоит — одной строкой для замерщика. */
  hint: string;
  /** Какие секции доступны в этой зоне. */
  sections: SectionKind[];
  /** Состав по умолчанию, если шаблон не выбран. */
  defaultSections: SectionKind[];
  /**
   * Чем добирается длинная стена. Секция, которую в этой зоне не жалко
   * повторить: лишняя полка — мебель, доборная планка в два метра — дыра.
   */
  fillSection: SectionKind;
  /** Чем зона закрывается по умолчанию. */
  doorSystem: DoorSystem;
  /** Столешница и фартук есть не везде: в спальне их нет вовсе. */
  hasCountertop: boolean;
  hasApron: boolean;
  /** Корпус из влагостойкого ЛДСП — своя ставка, дороже обычной. */
  moistureProof: boolean;
  /** Что снимает рендер в этой зоне: кадр, свет, что попадает в кадр. */
  scene: string;
};

export const ZONE_PROFILES: Record<ZoneKind, ZoneProfile> = {
  kitchen: {
    kind: 'kitchen',
    title: 'Кухня',
    depthMm: 560,
    height: 'ceiling',
    hint: 'Нижний и верхний ряд, техника, мойка, столешница',
    sections: [],
    defaultSections: [],
    fillSection: 'shelves',
    doorSystem: 'hinged',
    hasCountertop: true,
    hasApron: true,
    moistureProof: false,
    scene:
      'кухня целиком вдоль стены, столешница и фартук в кадре, техника встроена; '
      + 'на столешнице минимум предметов — доска, чайник, керамика',
  },

  bedroom: {
    kind: 'bedroom',
    title: 'Спальня',
    // 500 полезной глубины + 100 под механизм дверей-купе.
    depthMm: 600,
    height: 'ceiling',
    hint: 'Шкаф-купе до потолка: штанга, полки, ящики',
    sections: ['hanging_long', 'hanging_double', 'shelves', 'drawers', 'open', 'mezzanine'],
    defaultSections: ['hanging_long', 'shelves', 'drawers', 'hanging_double'],
    fillSection: 'shelves',
    doorSystem: 'sliding',
    hasCountertop: false,
    hasApron: false,
    moistureProof: false,
    scene:
      'шкаф во всю стену от пола до потолка, кровать частично в кадре с краю; '
      + 'мягкий вечерний свет, подсветка внутри открытых секций включена; '
      + 'двери-купе приоткрыты, видно штангу и полки',
  },

  hallway: {
    kind: 'hallway',
    title: 'Прихожая',
    // 400 мм: обычная штанга вдоль стены уже не помещается.
    depthMm: 400,
    height: 'ceiling',
    hint: 'Вешалка, обувница, скамья, зеркало',
    sections: ['hooks', 'shoes', 'bench', 'mirror', 'shelves', 'mezzanine'],
    defaultSections: ['hooks', 'shoes', 'bench', 'mirror'],
    fillSection: 'shelves',
    doorSystem: 'hinged',
    hasCountertop: false,
    hasApron: false,
    moistureProof: false,
    scene:
      'узкий кадр прихожей вдоль стены, зеркало отражает дверной проём; '
      + 'свет сверху, на крючках одна куртка для масштаба; '
      + 'обувь на нижнем ярусе обувницы',
  },

  living: {
    kind: 'living',
    title: 'Зал',
    depthMm: 400,
    height: 2000,
    hint: 'ТВ-зона: ниша, подвесные модули, подсветка',
    sections: ['tv_niche', 'hanging_module', 'open', 'drawers', 'shelves'],
    defaultSections: ['hanging_module', 'tv_niche', 'hanging_module', 'drawers'],
    fillSection: 'hanging_module',
    doorSystem: 'hinged',
    hasCountertop: false,
    hasApron: false,
    moistureProof: false,
    scene:
      'ТВ-зона вдоль стены, телевизор ВЫКЛЮЧЕН — чёрный матовый экран без картинки; '
      + 'подсветка ниши включена и даёт мягкий контур; диван частично в кадре на переднем плане',
  },

  bathroom: {
    kind: 'bathroom',
    title: 'Санузел',
    depthMm: 450,
    height: 850,
    hint: 'Тумба под раковину, пенал, зеркальный шкаф',
    sections: ['vanity', 'tall_unit', 'mirror_cabinet', 'open', 'drawers'],
    defaultSections: ['vanity', 'tall_unit'],
    // Длинную стену санузла добираем тумбами, а не частоколом пеналов.
    fillSection: 'drawers',
    doorSystem: 'hinged',
    hasCountertop: true,
    hasApron: false,
    // Влагостойкий ЛДСП или МДФ: обычный в санузле разбухает по кромке.
    moistureProof: true,
    scene:
      'тумба под раковину и пенал вдоль стены, влажный блик на плитке; '
      + 'зеркало с подсветкой над тумбой, полотенце на крючке для масштаба; '
      + 'смеситель и слив в кадре',
  },
};

export const ZONE_ORDER: ZoneKind[] = ['kitchen', 'bedroom', 'living', 'bathroom', 'hallway'];

/** Профиль зоны. Неизвестная зона — кухня: она и есть основной продукт. */
export function zoneProfile(kind: ZoneKind | undefined | null): ZoneProfile {
  return ZONE_PROFILES[kind ?? 'kitchen'] ?? ZONE_PROFILES.kitchen;
}

/** Зона без техники: ряд собирается из секций, а не из приборов. */
export function isSectionZone(kind: ZoneKind | undefined | null): boolean {
  return (kind ?? 'kitchen') !== 'kitchen';
}

/** Пометка на карточке зоны, которая ещё не просчитана. */
export const ZONE_DRAFT_BADGE = 'В разработке';

/** Что это значит — одной строкой под списком, а не по разу на карточке. */
export const ZONE_DRAFT_NOTE =
  'Зоны с пометкой «в разработке» считаются как корпусный ряд без своей специфики.';

/** Высота ряда в мм: «до потолка» разрешается по замеру. */
export function zoneHeightMm(kind: ZoneKind | undefined | null, ceilingHeightMm: number): number {
  const profile = zoneProfile(kind);
  return profile.height === 'ceiling' ? ceilingHeightMm : profile.height;
}
