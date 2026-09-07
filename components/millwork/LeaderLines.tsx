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

  const { left, right } = layoutLeaders(anchors, { lengthMm, ceilingMm });
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
      const edge = side === 'left' ? scale.drawLeft - scale.marginUnits * 0.55 : scale.drawRight + scale.marginUnits * 0.55;
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
    </g>
  );
}
