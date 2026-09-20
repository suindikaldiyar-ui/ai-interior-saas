import { handleOf, openingOf } from './opening';
import type {
  HandleLevel,
  HandlePlace,
  HandleSpotPlace,
  HandleTurn,
  Module,
  Run,
} from '@/types/millwork';

/**
 * ГДЕ НА ФАСАДЕ СТОИТ РУЧКА.
 *
 * СНАЧАЛА ВЫБИРАЕТСЯ ОТКРЫВАНИЕ, ПОТОМ СТАВИТСЯ РУЧКА — и не наоборот.
 * Мебельщик решает, куда открывается створка, а ручка встаёт напротив
 * петель сама: на петельной стороне за неё не взяться, а открытая дверца
 * бьёт по руке. Это не предпочтение, это физика узла.
 *
 * Отсюда главное следствие: СТОРОНА НЕ ХРАНИТСЯ. Она выводится из
 * направления открывания, и выбрать её нельзя — не потому что запрещено,
 * а потому что такого поля нет. Ручка на стороне петель в этом продукте
 * не выражается вовсе.
 *
 * Замерщик правит две вещи, и обе хранятся на модуле:
 *
 *   `fill.handleLevel`  высота: верх · середина · низ
 *   `fill.handleTurn`   планка вертикально или горизонтально
 *
 * Сменил направление — ручка переехала на другой край, а его высота и
 * поворот остались: он выбирал их, а не сторону.
 *
 * ВОСЕМЬ МЕСТ = ТРИ ВЫСОТЫ НА ЛЕВОМ КРАЮ, ТРИ НА ПРАВОМ, ПЛЮС СЕРЕДИНА
 * ВЕРХНЕЙ И НИЖНЕЙ КРОМКИ. Верхняя и нижняя достаются механизмам:
 * подъёмнику ручка нужна снизу, откидному сверху — там свободный край.
 */

export const HANDLE_SPOTS: { key: HandleSpotPlace; title: string }[] = [
  { key: 'left-top', title: 'Слева вверху' },
  { key: 'left-middle', title: 'Слева посередине' },
  { key: 'left-bottom', title: 'Слева внизу' },
  { key: 'right-top', title: 'Справа вверху' },
  { key: 'right-middle', title: 'Справа посередине' },
  { key: 'right-bottom', title: 'Справа внизу' },
  { key: 'top-center', title: 'Сверху по центру' },
  { key: 'bottom-center', title: 'Снизу по центру' },
];

export const HANDLE_TURNS: { key: HandleTurn; title: string }[] = [
  { key: 'vertical', title: 'Вертикально' },
  { key: 'horizontal', title: 'Горизонтально' },
];

export const HANDLE_LEVELS: { key: HandleLevel; title: string }[] = [
  { key: 'top', title: 'Вверху' },
  { key: 'middle', title: 'Посередине' },
  { key: 'bottom', title: 'Внизу' },
];

const LEVELS = new Set<string>(HANDLE_LEVELS.map((level) => level.key));
const TURNS = new Set<string>(HANDLE_TURNS.map((turn) => turn.key));
const SPOTS = new Set<string>(HANDLE_SPOTS.map((spot) => spot.key));

export function handleLevelOrNull(value: unknown): HandleLevel | null {
  return typeof value === 'string' && LEVELS.has(value) ? (value as HandleLevel) : null;
}

export function handleTurnOrNull(value: unknown): HandleTurn | null {
  return typeof value === 'string' && TURNS.has(value) ? (value as HandleTurn) : null;
}

export function handleSpotOrNull(value: unknown): HandleSpotPlace | null {
  return typeof value === 'string' && SPOTS.has(value) ? (value as HandleSpotPlace) : null;
}

/** Куда ручка встала и как повёрнута планка. */
export type HandleSpot = { place: HandleSpotPlace; turn: HandleTurn };

/**
 * СТАРОЕ ЗНАЧЕНИЕ ПЕРЕНОСИТСЯ ПО СМЫСЛУ, А НЕ СБРАСЫВАЕТСЯ.
 *
 * До этой правки место хранилось целиком — «четыре кромки × две
 * ориентации» (`top-along`, `right-across` и соседи). Сторона в нём была
 * ЧАСТЬЮ ЗНАЧЕНИЯ, и её приходится отбросить: теперь она выводится из
 * петель, и сохранённая спорила бы с выводом на первой же смене
 * направления.
 *
 * Потери от этого нет. Старая сторона сама выводилась из петель тем же
 * правилом «напротив петельной», а высоты в прежней раскладке не было
 * вовсе — все значения рисовались по середине кромки. Значит из старого
 * значения переносится ровно то, что в нём было своего: ПОВОРОТ планки.
 * Высота становится серединой — ею она и была.
 */
export function levelFromLegacy(place: HandlePlace | undefined): HandleTurn | null {
  if (!place) return null;
  if (place === 'left-along' || place === 'right-along') return 'vertical';
  if (place === 'left-across' || place === 'right-across') return 'horizontal';
  if (place === 'top-along' || place === 'bottom-along') return 'horizontal';
  if (place === 'top-across' || place === 'bottom-across') return 'vertical';
  return null;
}

/**
 * КУДА ВСТАЁТ РУЧКА ЭТОГО МОДУЛЯ.
 *
 * Сторона выводится, высота и поворот берутся у человека. Одна функция
 * на сцену, чертёж и таблицу фурнитуры: три ответа на «где ручка»
 * разъехались бы, а сборщик читает лист и смотрит на картинку рядом.
 */
export function handleSpotOf(
  unit: Module,
  run: Pick<Run, 'options'>,
  /**
   * Сторона петель ЭТОГО полотна.
   *
   * У двух створок стороны разные: левая на левой петле, правая на
   * правой, — и ручка у каждой на своём свободном краю. Сцена знает это
   * по индексу створки (`doorHinge`) и передаёт сюда; чертёж и таблица
   * фурнитуры спрашивают модуль целиком и оставляют пустым.
   */
  hinge?: 'left' | 'right',
): HandleSpot {
  const { handle } = handleOf(unit, run);
  const { opening } = openingOf(unit);

  const level = handleLevelOrNull(unit.fill?.handleLevel) ?? 'middle';
  const turn =
    handleTurnOrNull(unit.fill?.handleTurn) ??
    levelFromLegacy(unit.fill?.handlePlace) ??
    null;

  /*
   * ПРОФИЛЬ ИДЁТ ПО ВЕРХНЕЙ КРОМКЕ ВСЕГДА.
   *
   * Врезная ручка-профиль режется по ширине фасада и стоит под его
   * верхом — сторона петель ей безразлична. Так она и стояла до этой
   * правки, и ряды, собранные раньше, не двигаются.
   */
  if (handle === 'profile') return { place: 'top-center', turn: turn ?? 'horizontal' };

  /* У механизма ручка на СВОБОДНОМ крае: подъёмнику снизу, откидному сверху. */
  if (opening === 'lift') return { place: 'bottom-center', turn: turn ?? 'horizontal' };
  if (opening === 'flap') return { place: 'top-center', turn: turn ?? 'horizontal' };

  /*
   * РАСПАШНАЯ СТВОРКА: РУЧКА НАПРОТИВ ПЕТЕЛЬ.
   *
   * `openingOf` отвечает, с какой стороны петли; всё, что не «справа»,
   * считается левым — так же, как решает сцена, когда вращает полотно.
   */
  const hingeRight = hinge ? hinge === 'right' : opening === 'right';
  const side: 'left' | 'right' = hingeRight ? 'left' : 'right';

  return { place: `${side}-${level}` as HandleSpotPlace, turn: turn ?? 'vertical' };
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
 * на первой же правке.
 *
 * Ручка не выходит за полотно ни в одном из шестнадцати сочетаний: длина
 * планки ограничена долей стороны, вдоль которой она лежит, а отступ от
 * кромки считается от МЕНЬШЕЙ стороны — на узкой дверце он меньше, и
 * планка не свисает.
 */
export function handleBoxOf(spot: HandleSpot, leaf: LeafGeometry): HandleBox {
  const { cx, cy, widthM, heightM, thicknessM } = leaf;
  const inset = Math.min(widthM, heightM) * EDGE_INSET;
  const z = thicknessM + BAR / 2;

  /** Длина планки: доля стороны, вдоль которой она стоит, но не больше поля. */
  const span = (side: number) => Math.min(0.26, Math.max(0.06, side * 0.5));

  /* Вертикальная планка длинная по Y, горизонтальная — по X. */
  const scale: [number, number, number] =
    spot.turn === 'vertical'
      ? [BAR, Math.min(span(heightM), heightM - inset * 2), BAR]
      : [Math.min(span(widthM), widthM - inset * 2), BAR, BAR];

  const halfW = scale[0] / 2;
  const halfH = scale[1] / 2;

  /** Отступ от края: планка целиком внутри полотна при любом повороте. */
  const edgeX = Math.max(inset, halfW);
  const edgeY = Math.max(inset, halfH);

  const x =
    spot.place.startsWith('left')
      ? cx - widthM / 2 + edgeX
      : spot.place.startsWith('right')
        ? cx + widthM / 2 - edgeX
        : cx;

  const y =
    spot.place.endsWith('-top')
      ? cy + heightM / 2 - edgeY
      : spot.place.endsWith('-bottom')
        ? cy - heightM / 2 + edgeY
        : spot.place === 'top-center'
          ? cy + heightM / 2 - edgeY
          : spot.place === 'bottom-center'
            ? cy - heightM / 2 + edgeY
            : cy;

  return { position: [x, y, z], scale };
}
