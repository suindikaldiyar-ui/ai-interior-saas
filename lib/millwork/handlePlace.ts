import type { FrontOpening, HandleKind, HandlePlace } from '@/types/millwork';

/**
 * ГДЕ НА ФАСАДЕ СТОИТ РУЧКА.
 *
 * Тип ручки (скоба, профиль, нажатие) и её МЕСТО — разные вопросы. Тип
 * это фурнитура и деньги, место — как мебель выглядит и как за неё
 * берутся. Мебельщик ставит скобу и вверху, и внизу, и вдоль кромки, и
 * поперёк — а продукт выводил место из стороны петель и больше ничего
 * не спрашивал.
 *
 * ВОСЕМЬ ПОЛОЖЕНИЙ = ЧЕТЫРЕ КРОМКИ × ДВЕ ОРИЕНТАЦИИ.
 *
 *   верх / низ / левая / правая  — у какой кромки полотна лежит ручка
 *   вдоль / поперёк              — параллельно этой кромке или к ней
 *
 * «Вдоль верхней» — горизонтальная планка под верхней кромкой, так стоит
 * ручка-профиль. «Поперёк верхней» — вертикальная скоба, свисающая от
 * верхней кромки вниз: так делают на высоких фасадах. Раскладка выбрана
 * потому, что ею описывается всё, что встречается в цеху, и каждое
 * положение отличается от остальных и координатой, и ориентацией — то
 * есть его видно, а не только называется по-разному.
 *
 * МЕСТО ЛЕЖИТ НА МОДУЛЕ, рядом с типом ручки (`fill.handlePlace`):
 * второго состояния не заводится, правка ложится туда же, куда ширина и
 * материал, и так же переживает пересборку ряда.
 */

export const HANDLE_PLACES: { key: HandlePlace; title: string }[] = [
  { key: 'top-along', title: 'Сверху вдоль' },
  { key: 'top-across', title: 'Сверху поперёк' },
  { key: 'bottom-along', title: 'Снизу вдоль' },
  { key: 'bottom-across', title: 'Снизу поперёк' },
  { key: 'left-along', title: 'Слева вдоль' },
  { key: 'left-across', title: 'Слева поперёк' },
  { key: 'right-along', title: 'Справа вдоль' },
  { key: 'right-across', title: 'Справа поперёк' },
];

const KEYS = new Set<string>(HANDLE_PLACES.map((place) => place.key));

/** Известное положение или `null`: чужая строка местом ручки не становится. */
export function handlePlaceOrNull(value: unknown): HandlePlace | null {
  return typeof value === 'string' && KEYS.has(value) ? (value as HandlePlace) : null;
}

/**
 * ПОЛОЖЕНИЕ ПО УМОЛЧАНИЮ — РОВНО ТО, ЧТО СТОЯЛО ДО ВЫБОРА.
 *
 * Профиль лежал по верхней кромке, подъёмник — по нижней, откидной — по
 * верхней, скоба — вертикально у края, противоположного петлям. Всё это
 * повторено здесь до последнего случая: ряд, собранный раньше, обязан
 * выглядеть так же, как выглядел, и отпечаток его не имеет права
 * поехать (ловушка 246).
 */
export function defaultHandlePlace(
  kind: HandleKind,
  opening: FrontOpening,
  hinge: 'left' | 'right',
): HandlePlace {
  if (kind === 'profile') return 'top-along';
  if (opening === 'lift') return 'bottom-along';
  if (opening === 'flap') return 'top-along';
  /* Скоба стоит у СВОБОДНОГО края: петли слева — ручка справа. */
  return hinge === 'left' ? 'right-along' : 'left-along';
}

/** Что известно о полотне, чтобы поставить на него ручку. */
export type LeafGeometry = {
  /** Центр полотна в метрах сцены. */
  cx: number;
  cy: number;
  /** Габарит полотна в метрах. */
  widthM: number;
  heightM: number;
  /** Толщина фасада: ручка лежит поверх него. */
  thicknessM: number;
};

export type HandleBox = {
  position: [number, number, number];
  scale: [number, number, number];
};

/** Насколько ручка отступает от кромки полотна, доля меньшей стороны. */
const EDGE_INSET = 0.12;
/** Толщина планки ручки в метрах: она же её вылет от фасада. */
const BAR = 0.016;

/**
 * Габарит и место ручки на полотне.
 *
 * Считается ОДИН раз и здесь: сцена, чертёж и деталировка обязаны
 * показывать ручку в одном месте, а три формулы одного места разъедутся
 * на первой же правке — этот класс ошибки в продукте ловился больше
 * десяти раз.
 *
 * Ручка не выходит за полотно ни в одном из восьми положений: длина
 * ограничена долей стороны, вдоль которой она лежит, а отступ от кромки
 * считается от меньшей стороны полотна — на узкой дверце он меньше, и
 * планка не свисает.
 */
export function handleBoxOf(place: HandlePlace, leaf: LeafGeometry): HandleBox {
  const { cx, cy, widthM, heightM, thicknessM } = leaf;
  const inset = Math.min(widthM, heightM) * EDGE_INSET;
  const z = thicknessM + BAR / 2;

  /** Длина планки: доля стороны, вдоль которой она стоит. */
  const along = (side: number) => Math.min(0.26, Math.max(0.06, side * 0.6));
  /** Длина планки поперёк: короче, иначе она перекрывает половину полотна. */
  const across = (side: number) => Math.min(0.18, Math.max(0.05, side * 0.32));

  switch (place) {
    case 'top-along':
      return {
        position: [cx, cy + heightM / 2 - inset, z],
        scale: [along(widthM), BAR, BAR],
      };
    case 'top-across':
      return {
        position: [cx, cy + heightM / 2 - inset - across(heightM) / 2, z],
        scale: [BAR, across(heightM), BAR],
      };
    case 'bottom-along':
      return {
        position: [cx, cy - heightM / 2 + inset, z],
        scale: [along(widthM), BAR, BAR],
      };
    case 'bottom-across':
      return {
        position: [cx, cy - heightM / 2 + inset + across(heightM) / 2, z],
        scale: [BAR, across(heightM), BAR],
      };
    case 'left-along':
      return {
        position: [cx - widthM / 2 + inset, cy, z],
        scale: [BAR, along(heightM), BAR],
      };
    case 'left-across':
      return {
        position: [cx - widthM / 2 + inset + across(widthM) / 2, cy, z],
        scale: [across(widthM), BAR, BAR],
      };
    case 'right-along':
      return {
        position: [cx + widthM / 2 - inset, cy, z],
        scale: [BAR, along(heightM), BAR],
      };
    case 'right-across':
    default:
      return {
        position: [cx + widthM / 2 - inset - across(widthM) / 2, cy, z],
        scale: [across(widthM), BAR, BAR],
      };
  }
}
