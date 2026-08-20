'use client';

/**
 * Сквозная размерная цепочка — сигнатурный элемент инструмента.
 *
 * Одна и та же цепочка идёт под лентой модулей, под чертежом и на плане:
 * всегда в миллиметрах, синькой, с выносными линиями и засечками под 45°.
 * Сумма отрезков сходится с длиной ряда, и это видно глазом — доказательство,
 * что инструмент считает, а не рисует.
 */

export type DimSegment = {
  id: string;
  fromMm: number;
  toMm: number;
  /** Подсветить как изменившийся — на 400 мс. */
  changed?: boolean;
  highlighted?: boolean;
};

type Props = {
  segments: DimSegment[];
  totalMm: number;
  /** Ширина рисунка в пользовательских единицах SVG. */
  width: number;
  /** Масштаб: пикселей SVG на миллиметр. */
  scale: number;
  y?: number;
  showTotal?: boolean;
  onSelect?: (id: string) => void;
};

const TICK = 5;

export default function DimensionChain({
  segments,
  totalMm,
  width,
  scale,
  y = 0,
  showTotal = true,
  onSelect,
}: Props) {
  const line = y + 14;
  const totalLine = y + 40;

  return (
    <g>
      {segments.map((segment) => {
        const x1 = segment.fromMm * scale;
        const x2 = segment.toMm * scale;
        const mid = (x1 + x2) / 2;
        const span = segment.toMm - segment.fromMm;

        return (
          <g
            key={segment.id}
            onClick={onSelect ? () => onSelect(segment.id) : undefined}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            {/* выносные линии */}
            <line x1={x1} y1={y - 4} x2={x1} y2={line + TICK} stroke="var(--blueprint)" strokeWidth={0.5} />
            <line x1={x2} y1={y - 4} x2={x2} y2={line + TICK} stroke="var(--blueprint)" strokeWidth={0.5} />
            {/* размерная линия */}
            <line x1={x1} y1={line} x2={x2} y2={line} stroke="var(--blueprint)" strokeWidth={0.8} />
            {/* засечки под 45° — как на настоящем чертеже, а не стрелки */}
            <line
              x1={x1 - TICK / 2}
              y1={line + TICK / 2}
              x2={x1 + TICK / 2}
              y2={line - TICK / 2}
              stroke="var(--blueprint)"
              strokeWidth={0.8}
            />
            <line
              x1={x2 - TICK / 2}
              y1={line + TICK / 2}
              x2={x2 + TICK / 2}
              y2={line - TICK / 2}
              stroke="var(--blueprint)"
              strokeWidth={0.8}
            />
            {segment.highlighted && (
              <rect
                x={x1}
                y={line - 11}
                width={x2 - x1}
                height={13}
                fill="var(--tape)"
                opacity={0.35}
              />
            )}
            <text
              key={`${segment.id}-${span}`}
              className={`mw-num${segment.changed ? ' mw-flash' : ''}`}
              x={mid}
              y={line - 3}
              textAnchor="middle"
              fontSize={9}
              fill="var(--blueprint)"
            >
              {span}
            </text>
          </g>
        );
      })}

      {showTotal && (
        <g>
          <line x1={0} y1={totalLine} x2={width} y2={totalLine} stroke="var(--blueprint)" strokeWidth={1} />
          <line x1={0} y1={totalLine - TICK} x2={0} y2={totalLine + TICK} stroke="var(--blueprint)" strokeWidth={1} />
          <line
            x1={width}
            y1={totalLine - TICK}
            x2={width}
            y2={totalLine + TICK}
            stroke="var(--blueprint)"
            strokeWidth={1}
          />
          <text
            className="mw-num"
            x={width / 2}
            y={totalLine - 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="var(--blueprint)"
          >
            {totalMm}
          </text>
        </g>
      )}
    </g>
  );
}
