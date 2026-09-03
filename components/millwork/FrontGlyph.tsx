'use client';

import { LiftMark, SwingMark } from './DrawingSymbols';
import { frontGlyph, type GlyphMode } from '@/lib/millwork/frontGlyph';
import type { Module } from '@/types/millwork';

/**
 * ФАСАД МОДУЛЯ ПО ОПИСАНИЮ.
 *
 * Что рисовать, решает `frontGlyph` — одна чистая функция на весь чертёж.
 * Здесь только рисование: линия, штрих, дуга. Разведи эти две вещи по
 * разным местам — и приёмка перестанет ловить варианты, которые выглядят
 * одинаково, а именно так витрина с подсветкой и оказалась обычным шкафом.
 */

const LINE = 'var(--blueprint)';

type Props = {
  unit: Module;
  mode: GlyphMode;
  /** Габарит модуля в единицах чертежа. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export default function FrontGlyph({ unit, mode, x, y, width, height }: Props) {
  const elements = frontGlyph(unit, mode);

  return (
    <g data-glyph={unit.id}>
      {elements.map((el, i) => {
        switch (el.kind) {
          case 'panel':
            // Контур модуля уже нарисован: сплошная створка — это он и есть.
            return null;

          case 'split':
            return (
              <line
                key={i}
                x1={x + width / 2}
                y1={y}
                x2={x + width / 2}
                y2={y + height}
                stroke={LINE}
                strokeWidth={0.4}
              />
            );

          case 'swing': {
            const half = unit.doorCount >= 2 ? width / 2 : width;
            const left = el.hinge === 'left' ? x : x + width - half;
            return (
              <SwingMark
                key={i}
                x={left}
                y={y}
                width={half}
                height={height}
                hinge={el.hinge}
              />
            );
          }

          case 'drawer': {
            const step = height / el.count;
            const top = y + step * el.index;
            return (
              <g key={i} data-symbol="drawer">
                {el.index > 0 && (
                  <line x1={x} y1={top} x2={x + width} y2={top} stroke={LINE} strokeWidth={0.4} />
                )}
                {/* Стрелка вперёд: по ней ящик не спутать со створкой. */}
                <g stroke={LINE} strokeWidth={0.5} fill="none" opacity={0.8}>
                  <line
                    x1={x + width * 0.34}
                    y1={top + step / 2}
                    x2={x + width * 0.66}
                    y2={top + step / 2}
                  />
                  <path
                    d={`M${x + width * 0.66 - 3} ${top + step / 2 - 2.4} L${x + width * 0.66} ${
                      top + step / 2
                    } L${x + width * 0.66 - 3} ${top + step / 2 + 2.4}`}
                  />
                </g>
              </g>
            );
          }

          case 'frame':
            // Рама витрины: контур внутрь от кромки модуля.
            return (
              <rect
                key={i}
                x={x + 3}
                y={y + 3}
                width={Math.max(2, width - 6)}
                height={Math.max(2, height - 6)}
                fill="none"
                stroke={LINE}
                strokeWidth={0.8}
                data-symbol="frame"
              />
            );

          case 'glass':
            /*
             * Стекло — НЕЗАКРАШЕННОЕ поле с угловым бликом. Сплошная
             * заливка на чёрно-белой печати схлопывается, и витрина
             * превращается в обычный шкаф.
             */
            return (
              <g key={i} data-symbol="glass" stroke={LINE} strokeWidth={0.4} opacity={0.7}>
                <line
                  x1={x + 6}
                  y1={y + height - 8}
                  x2={x + Math.min(width - 8, 18)}
                  y2={y + 8}
                />
                <line
                  x1={x + 12}
                  y1={y + height - 8}
                  x2={x + Math.min(width - 6, 24)}
                  y2={y + 8}
                />
              </g>
            );

          case 'shelf': {
            const step = height / (el.count + 1);
            return (
              <g key={i} data-symbol="shelf">
                {Array.from({ length: el.count }, (_, k) => (
                  <line
                    key={k}
                    x1={x + 4}
                    y1={y + step * (k + 1)}
                    x2={x + width - 4}
                    y2={y + step * (k + 1)}
                    stroke={LINE}
                    strokeWidth={0.45}
                    opacity={mode === 'fronts' ? 0.55 : 1}
                  />
                ))}
              </g>
            );
          }

          case 'led': {
            // Волна по нижней кромке: подсветка витрины светит вниз.
            const step = Math.max(4, width / 8);
            const parts = [`M${x + 4} ${y + height - 3}`];
            for (let k = 0; k < 4; k += 1) parts.push(`q ${step / 2} -3 ${step} 0`);
            return (
              <path
                key={i}
                d={parts.join(' ')}
                fill="none"
                stroke={LINE}
                strokeWidth={0.5}
                data-symbol="led"
              />
            );
          }

          case 'open':
            /*
             * Открытая секция: фасада нет, и контур тоньше — по нему видно,
             * что закрывать здесь нечем.
             */
            return (
              <rect
                key={i}
                x={x + 1.5}
                y={y + 1.5}
                width={Math.max(1, width - 3)}
                height={Math.max(1, height - 3)}
                fill="none"
                stroke={LINE}
                strokeWidth={0.35}
                strokeDasharray="3 2"
                data-symbol="open"
              />
            );

          case 'cargo':
            // Вертикальная стрелка выдвижения: карго едет на себя.
            return (
              <g key={i} data-symbol="cargo" stroke={LINE} strokeWidth={0.5} fill="none">
                <line x1={x + width / 2} y1={y + height - 6} x2={x + width / 2} y2={y + 8} />
                <path
                  d={`M${x + width / 2 - 2.5} ${y + 12} L${x + width / 2} ${y + 8} L${
                    x + width / 2 + 2.5
                  } ${y + 12}`}
                />
              </g>
            );

          case 'dryer': {
            // Решётка сушилки пунктиром: две полки в клетку.
            const cells = 4;
            return (
              <g key={i} data-symbol="dryer" stroke={LINE} strokeWidth={0.35} strokeDasharray="2 2">
                {Array.from({ length: cells }, (_, k) => (
                  <line
                    key={k}
                    x1={x + 5 + ((width - 10) / cells) * k}
                    y1={y + height * 0.35}
                    x2={x + 5 + ((width - 10) / cells) * k}
                    y2={y + height * 0.75}
                  />
                ))}
                <line x1={x + 5} y1={y + height * 0.35} x2={x + width - 5} y2={y + height * 0.35} />
                <line x1={x + 5} y1={y + height * 0.75} x2={x + width - 5} y2={y + height * 0.75} />
              </g>
            );
          }

          case 'lift':
            return <LiftMark key={i} x={x} y={y} width={width} height={height} />;

          case 'sinkCut':
            // Чаша мойки пунктиром сверху: у модуля нет дна, там сифон.
            return (
              <rect
                key={i}
                x={x + width * 0.15}
                y={y + 2}
                width={width * 0.7}
                height={Math.min(10, height * 0.18)}
                rx={2}
                fill="none"
                stroke={LINE}
                strokeWidth={0.4}
                strokeDasharray="3 2"
                data-symbol="sink"
              />
            );

          case 'hobStrip':
            // Полоса варочной панели: под ней ящик всегда укорочен.
            return (
              <rect
                key={i}
                x={x + 2}
                y={y}
                width={Math.max(1, width - 4)}
                height={Math.min(6, height * 0.12)}
                fill={LINE}
                fillOpacity={0.35}
                stroke={LINE}
                strokeWidth={0.4}
                data-symbol="hob"
              />
            );

          case 'hoodDuct':
            return (
              <g key={i} data-symbol="hood" stroke={LINE} strokeWidth={0.4} strokeDasharray="3 2">
                <line x1={x + width / 2 - 5} y1={y} x2={x + width / 2 - 5} y2={y - 14} />
                <line x1={x + width / 2 + 5} y1={y} x2={x + width / 2 + 5} y2={y - 14} />
              </g>
            );

          case 'rod':
            // Штанга: труба поперёк секции, кружки — держатели.
            return (
              <g key={i} data-symbol="rod">
                <line
                  x1={x + 4}
                  y1={y + height * 0.18}
                  x2={x + width - 4}
                  y2={y + height * 0.18}
                  stroke={LINE}
                  strokeWidth={1.1}
                />
                <circle cx={x + 6} cy={y + height * 0.18} r={1.4} fill={LINE} />
                <circle cx={x + width - 6} cy={y + height * 0.18} r={1.4} fill={LINE} />
              </g>
            );

          case 'niche':
            // Ниши колонны рисует сам чертёж: там нужны их высоты в мм.
            return null;

          default:
            return null;
        }
      })}
    </g>
  );
}
