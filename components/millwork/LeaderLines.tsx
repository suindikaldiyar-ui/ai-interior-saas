'use client';

import { layoutLeaders, type LeaderAnchor } from '@/lib/millwork/leaders';

/**
 * ЛИНИИ ВЫНОСОК НА ФАСАДЕ.
 *
 * Линия от точки на детали, излом, горизонтальная полка, текст над полкой.
 * На конце ТОЧКА, а не стрелка: так принято в мебельных чертежах, и по этой
 * мелочи проектировщик отличает чертёж от картинки.
 *
 * Полки живут в полях слева и справа от рисунка и разведены по высоте, чтобы
 * не пересекаться ни между собой, ни с размерной цепочкой.
 */

export type LeaderScale = {
  /** Перевод миллиметров ряда в единицы вида. */
  xOf: (mm: number) => number;
  yOf: (mm: number) => number;
  /** Границы поля рисунка в единицах вида. */
  drawLeft: number;
  drawRight: number;
  /** Ширина поля под полки. */
  marginUnits: number;
  /** Кегль подписи в единицах вида. */
  fontSize: number;
};

type Props = {
  anchors: LeaderAnchor[];
  lengthMm: number;
  ceilingMm: number;
  scale: LeaderScale;
};

export default function LeaderLines({ anchors, lengthMm, ceilingMm, scale }: Props) {
  if (anchors.length === 0) return null;

  /*
   * ЗАЗОР МЕЖДУ ПОЛКАМИ — ЭТО ВЫСОТА СТРОКИ, ПЕРЕСЧИТАННАЯ В МОДЕЛЬ.
   *
   * Раскладка работает в миллиметрах мебели, а наложение случается в
   * единицах листа: полка это текст кеглем `fontSize`. Пересчёт возможен
   * только здесь, где известны обе величины, — ровно как у толщин линий.
   */
  const unitsPerMm = Math.abs(scale.yOf(0) - scale.yOf(1000)) / 1000;
  const minGapMm = unitsPerMm > 0 ? (scale.fontSize * 1.35) / unitsPerMm : 0;

  const { left, right, hidden } = layoutLeaders(anchors, { lengthMm, ceilingMm, minGapMm });
  const line = 'var(--blueprint)';

  const draw = (side: 'left' | 'right', list: ReturnType<typeof layoutLeaders>['left']) =>
    list.map((leader) => {
      const px = scale.xOf(leader.xMm);
      const py = scale.yOf(leader.yMm);
      const shelfY = scale.yOf(leader.shelfYMm);

      /*
       * Полка уходит в поле за рисунком: слева — влево от чертежа, справа —
       * вправо. Излом ставится на границе поля, дальше идёт горизонталь.
       */
      /*
       * ИЗЛОМ СТОИТ НА ГРАНИЦЕ РИСУНКА, А НЕ В ПОЛЕ ПОДПИСЕЙ.
       *
       * Он был внутри поля на 55% его ширины — то есть диагональ заходила
       * туда, где лежат ЧУЖИЕ подписи, и резала их. Измерением отрезков
       * это дало четыре настоящих пересечения; по габаритам линий их не
       * видно вовсе, потому что габарит диагонали накрывает пол-листа.
       *
       * Поле подписей принадлежит подписям: за границей рисунка идут
       * только горизонтальные полки, а они разведены по высоте на строку.
       */
      const edge = side === 'left' ? scale.drawLeft : scale.drawRight;
      const shelfEnd = side === 'left' ? scale.drawLeft - scale.marginUnits : scale.drawRight + scale.marginUnits;

      return (
        <g key={leader.id}>
          {/* Точка на детали: наконечника нет намеренно. */}
          <circle cx={px} cy={py} r={2.2} fill={line} />
          <polyline
            points={`${px},${py} ${edge},${shelfY} ${shelfEnd},${shelfY}`}
            fill="none"
            stroke={line}
            strokeWidth={0.6}
          />
          {/*
            * Текст всегда начинается с ЛЕВОГО края полки: слева это её
            * дальний конец, справа — излом. Выравнивание по правому краю
            * увело бы подпись поверх чертежа.
            */}
          <text
            x={side === 'left' ? shelfEnd : edge}
            y={shelfY - 3}
            fontSize={scale.fontSize}
            fill={line}
            textAnchor="start"
          >
            {leader.text}
          </text>
        </g>
      );
    });

  /*
   * ВЫНОСКИ НЕ ЛОВЯТ УКАЗАТЕЛЬ.
   *
   * Это ПОДПИСЬ к мебели, а не мебель: нажимать на неё незачем. А лежат
   * они поверх модулей и пересекают их насквозь — линия с обводкой ловит
   * указатель по всей длине, и модуль под ней переставал и выделяться, и
   * перетаскиваться. Дефект «клик по модулю без техники не выделяет»
   * держался именно на этом: у техники зона захвата шире, и в неё удавалось
   * попасть мимо выноски.
   */
  return (
    <g data-leaders pointerEvents="none">
      {draw('left', left)}
      {draw('right', right)}

      {/*
        * ЧТО НЕ ПОМЕСТИЛОСЬ — НАЗВАНО ЧИСЛОМ.
        *
        * Подпись внахлёст не читается, поэтому лишние выноски не
        * рисуются. Молча пропавшая подпись читается как забытый
        * материал, а материал никуда не делся: он в легенде листа.
        */}
      {hidden.length > 0 && (
        <text
          data-leaders-hidden={hidden.length}
          x={scale.drawLeft - scale.marginUnits}
          y={scale.yOf(0)}
          fontSize={scale.fontSize}
          fill={line}
          textAnchor="start"
        >
          ещё {hidden.length} — в легенде листа
        </text>
      )}
    </g>
  );
}
