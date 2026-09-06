import { APPLIANCE_SLOTS } from './modules';
import { SECTION_SPECS } from './sections';
import type { ApplianceKind, DoorSystem, SectionKind, ZoneKind } from '@/types/millwork';

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
  /**
   * ОТКУДА НАЧИНАЕТСЯ ВЕРХНИЙ РЯД, мм от пола.
   *
   * У кухни это отраслевые 1450: между столешницей и низом навесных
   * шкафов стоит фартук, и высота его известна.
   *
   * У зон-секций верхнего ряда в кухонном смысле нет вовсе — там
   * антресоль, и она садится НА ШКАФ СВЕРХУ, а не на фиксированную
   * отметку. Поэтому число здесь не задаётся: его считает
   * `upperRowBottomMm` от потолка вниз, на высоту самой антресоли.
   *
   * Раньше 1450 применялось во всех зонах без разбора, и антресоль
   * оказывалась внутри шкафа, который идёт до потолка.
   */
  upperBottomMm?: number;
  /** Что за мебель тут стоит — одной строкой для замерщика. */
  hint: string;
  /**
   * Как называются фасады этой зоны. «Фасады кухни» в спальне читаются как
   * чужой текст, а замерщик показывает этот экран клиенту.
   */
  facadeTitle: string;
  /** Как зону называют в разговоре с клиентом: род у зон разный. */
  yours: string;
  /**
   * «на кухне», «в спальне» — предложный падеж. Без него отказ звучит
   * машинно: «в зоне «спальня» посудомойка не бывает» читается как
   * ошибка программы, а не как объяснение мира.
   */
  locative: string;
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
    // Фартук между столешницей и навесными шкафами — отраслевые 1450.
    upperBottomMm: 1450,
    hint: 'Нижний и верхний ряд, техника, мойка, столешница',
    facadeTitle: 'Фасады кухни',
    yours: 'Ваша кухня',
    locative: 'на кухне',
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
    facadeTitle: 'Фасады шкафа',
    yours: 'Ваша спальня',
    locative: 'в спальне',
    sections: [
      'hanging_long',
      'hanging_double',
      'shelves',
      'drawers',
      'open',
      'mezzanine',
      'glass_display',
    ],
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
    facadeTitle: 'Фасады прихожей',
    yours: 'Ваша прихожая',
    locative: 'в прихожей',
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
    facadeTitle: 'Фасады модулей',
    yours: 'Ваш зал',
    locative: 'в зале',
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
    facadeTitle: 'Фасады тумбы',
    yours: 'Ваш санузел',
    locative: 'в санузле',
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

/**
 * ОТМЕТКА НИЗА ВЕРХНЕГО РЯДА.
 *
 * Одна точка отсчёта на весь продукт: сцена, аксонометрия, чертёж, смета
 * и инвариант обязаны ставить верхний ряд на одну и ту же высоту.
 *
 *   кухня      — 1450 из профиля: над столешницей, за фартуком;
 *   остальные  — потолок минус высота антресоли: она садится НА шкаф.
 *
 * Кухонная константа в спальне давала 1450 при шкафе до 2700 — антресоль
 * попадала внутрь корпуса, и смета считала два корпуса в одном объёме.
 */
export function upperRowBottomMm(
  kind: ZoneKind | undefined | null,
  ceilingHeightMm: number,
  upperHeightMm: number,
): number {
  const profile = zoneProfile(kind);
  if (profile.upperBottomMm !== undefined) return profile.upperBottomMm;
  return Math.max(0, zoneHeightMm(kind, ceilingHeightMm) - upperHeightMm);
}

/* ─────────────────  Что бывает в этой зоне, а что нет  ───────────────── */

/**
 * ОДИН ИСТОЧНИК ПРАВДЫ О СОСТАВЕ ЗОНЫ.
 *
 * Шаг «Состав» долго оставался кухонным: холодильник, мойка и посудомойка
 * предлагались в шкафу-купе. Замерщик видит кнопки, которых там быть
 * не может, и перестаёт доверять экрану целиком — а он показывает этот
 * экран клиенту.
 *
 * Поэтому список доступного считается ОТСЮДА везде: чипы состава,
 * выпадающие списки модуля, операции движка и разбор команд модели.
 * Четыре независимых списка разъехались бы на первой же правке.
 */

/** Приборы этой зоны. В шкафу-купе их нет вовсе — и это не «пока нет». */
export function zoneAppliances(zone: ZoneKind | undefined | null): ApplianceKind[] {
  return zoneProfile(zone).kind === 'kitchen'
    ? (Object.keys(APPLIANCE_SLOTS) as ApplianceKind[])
    : [];
}

export function allowsAppliance(
  zone: ZoneKind | undefined | null,
  appliance: ApplianceKind,
): boolean {
  return zoneAppliances(zone).includes(appliance);
}

export function allowsSection(
  zone: ZoneKind | undefined | null,
  section: SectionKind,
): boolean {
  return zoneProfile(zone).sections.includes(section);
}

/**
 * Отказ словами, а не молчанием.
 *
 * «В спальне посудомойки не бывает» объясняет мир, а «не могу» выглядит
 * поломкой. Формулировка одна на интерфейс, движок и модель.
 */
export function zoneRefusal(zone: ZoneKind | undefined | null, what: string): string {
  return `${zoneProfile(zone).locative[0].toUpperCase()}${zoneProfile(zone).locative.slice(1)} такого не бывает: ${what}.`;
}

export function applianceRefusal(
  zone: ZoneKind | undefined | null,
  appliance: ApplianceKind,
): string {
  return zoneRefusal(zone, APPLIANCE_SLOTS[appliance].title.toLowerCase());
}

export function sectionRefusal(
  zone: ZoneKind | undefined | null,
  section: SectionKind,
): string {
  return zoneRefusal(zone, SECTION_SPECS[section].title.toLowerCase());
}

/**
 * Какие переключатели состава показывать.
 *
 * Переключатель, который ничего не меняет, — та же ложь, что чужая кнопка:
 * `upperToCeiling` в шкафу-купе не читается вовсе (высоту там задаёт
 * профиль зоны), а дверей-купе не бывает на кухне.
 */
export type ZoneOptions = {
  /** Верхний ряд и его высота: только там, где верхний ряд вообще есть. */
  upperRow: boolean;
  /** Купе или распашные: там, где шкаф закрывают полотнами. */
  doorSystem: boolean;
  /** Столешница и фартук. */
  countertop: boolean;
  /** Витрина с подсветкой как отдельная опция ряда. */
  glassDisplay: boolean;
};

export function zoneOptions(zone: ZoneKind | undefined | null): ZoneOptions {
  const profile = zoneProfile(zone);
  const kitchen = profile.kind === 'kitchen';

  return {
    upperRow: kitchen,
    // Купе ставят в шкаф: спальня и прихожая. На кухне их не бывает.
    doorSystem: profile.kind === 'bedroom' || profile.kind === 'hallway',
    countertop: profile.hasCountertop,
    // В остальных зонах витрина — это секция состава, а не опция ряда.
    glassDisplay: kitchen,
  };
}
