import type { ZoneKind } from '@/types/millwork';

/**
 * Зоны квартиры.
 *
 * Полностью работает КУХНЯ: под неё написаны стандарты, техника, коммуникации
 * и смета. Остальные зоны заведены габаритами и считаются как корпусный ряд
 * без своей специфики — и интерфейс говорит об этом прямо, а не делает вид,
 * что шкаф-купе посчитан по-настоящему.
 *
 * Здесь только то, что уже честно: глубина, высота и состав статей сметы.
 * Штанги, обувницы, зеркала, двери-купе по м² и сантехнические привязки —
 * это следующий слой, и до него зона остаётся «в разработке».
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
  /** Столешница и фартук есть не везде: в спальне их нет вовсе. */
  hasCountertop: boolean;
  hasApron: boolean;
  /**
   * Зона просчитана целиком. У всех, кроме кухни, false — и карточка
   * подписана «в разработке».
   */
  ready: boolean;
};

export const ZONE_PROFILES: Record<ZoneKind, ZoneProfile> = {
  kitchen: {
    kind: 'kitchen',
    title: 'Кухня',
    depthMm: 560,
    height: 'ceiling',
    hint: 'Нижний и верхний ряд, техника, мойка, столешница',
    hasCountertop: true,
    hasApron: true,
    ready: true,
  },
  bedroom: {
    kind: 'bedroom',
    title: 'Спальня',
    depthMm: 600,
    height: 'ceiling',
    hint: 'Шкаф до потолка: штанга, полки, ящики',
    hasCountertop: false,
    hasApron: false,
    ready: false,
  },
  living: {
    kind: 'living',
    title: 'Зал',
    depthMm: 400,
    height: 2000,
    hint: 'Подвесные модули, ниша под ТВ',
    hasCountertop: false,
    hasApron: false,
    ready: false,
  },
  bathroom: {
    kind: 'bathroom',
    title: 'Санузел',
    depthMm: 450,
    height: 850,
    hint: 'Тумба под раковину, пенал',
    hasCountertop: true,
    hasApron: false,
    ready: false,
  },
  hallway: {
    kind: 'hallway',
    title: 'Прихожая',
    depthMm: 400,
    height: 'ceiling',
    hint: 'Штанга, обувница, зеркало',
    hasCountertop: false,
    hasApron: false,
    ready: false,
  },
};

export const ZONE_ORDER: ZoneKind[] = ['kitchen', 'bedroom', 'living', 'bathroom', 'hallway'];

/** Профиль зоны. Неизвестная зона — кухня: она и есть основной продукт. */
export function zoneProfile(kind: ZoneKind | undefined | null): ZoneProfile {
  return ZONE_PROFILES[kind ?? 'kitchen'] ?? ZONE_PROFILES.kitchen;
}

/** Пометка на карточке зоны, которая ещё не просчитана. */
export const ZONE_DRAFT_BADGE = 'В разработке';

/** Что это значит — одной строкой под списком, а не по разу на карточке. */
export const ZONE_DRAFT_NOTE =
  'Зоны с пометкой «в разработке» считаются как корпусный ряд без своей специфики: '
  + 'штанги, обувницы, двери-купе по м² и сантехнические привязки ещё не заведены.';
