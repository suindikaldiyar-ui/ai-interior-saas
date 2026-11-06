'use client';

import { FlapMark, LiftMark, SwingMark } from './DrawingSymbols';
import { frontGlyph, type GlyphMode } from '@/lib/millwork/frontGlyph';
import { handleBoxOf } from '@/lib/millwork/handlePlace';
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
  /**
   * Множитель толщины линий.
   *
   * Толщины здесь заданы в единицах чертежа и держат ОТНОСИТЕЛЬНУЮ
   * иерархию: шов тоньше створки, створка тоньше контура. На бумаге же
   * толщина обязана быть абсолютной — 0.5 мм при любом масштабе. Поэтому
   * лист передаёт множитель, привязанный к 0.5 мм: иерархия сохраняется,
   * а линия становится настоящей чертёжной.
   */
  lineScale?: number;
  /** Высота корпуса, мм: по ней фасад, разделённый по высоте (P1/P2), рисуется своими участками. */
  heightMm?: number;
};

export default function FrontGlyph({
  unit,
  mode,
  x,
  y,
  width,
  height,
  lineScale = 1,
  heightMm,
}: Props) {
  const elements = frontGlyph(unit, mode, heightMm);
  const k = lineScale;

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
                strokeWidth={0.4 * k}
              />
            );

          case 'swing': {
            const half = unit.doorCount >= 2 && !el.band ? width / 2 : width;
            const left = el.hinge === 'left' ? x : x + width - half;
            /* Участок фасада, разделённого по высоте: доли от низа модуля, а SVG считает сверху. */
            const top = el.band ? y + height * (1 - el.band[1]) : y;
            const bandH = el.band ? height * (el.band[1] - el.band[0]) : height;
            return (
              <SwingMark
                key={i}
                x={left}
                y={top}
                width={half}
                height={bandH}
                hinge={el.hinge}
              />
            );
          }

          case 'zone': {
            /*
             * ЗОНА ФАСАДА: граница, створки диагоналями, ящики линиями, витрина штрихом, глухая панель — крестом: лист
             * печатают чёрно-белым, и наполнение обязано читаться линиями.
             */
            const y0 = y + height * (1 - el.to);
            const y1 = y + height * (1 - el.from);
            const h = y1 - y0;
            const line = (x1: number, ya: number, x2: number, yb: number, key: string, dash?: string) => (
              <line key={key} x1={x1} y1={ya} x2={x2} y2={yb} stroke={LINE} strokeWidth={0.4 * k} strokeDasharray={dash} />
            );
            return (
              <g key={i} data-glyph-zone={el.fill} data-glyph-zone-doors={el.doors}>
                {el.from > 0 ? line(x, y1, x + width, y1, 'seam') : null}
                {el.doors === 2 ? line(x + width / 2, y0, x + width / 2, y1, 'mid') : null}
                {el.fill === 'drawers'
                  ? Array.from({ length: Math.max(0, el.drawers - 1) }, (_, row) => line(x, y0 + (h * (row + 1)) / el.drawers, x + width, y0 + (h * (row + 1)) / el.drawers, `d${row}`))
                  : null}
                {el.fill === 'door' || el.fill === 'doors2'
                  ? Array.from({ length: el.doors }, (_, leaf) => {
                      const a = x + (width * leaf) / el.doors;
                      const b = x + (width * (leaf + 1)) / el.doors;
                      const hinge = el.doors === 2 ? (leaf === 0 ? a : b) : a;
                      const free = hinge === a ? b : a;
                      return (
                        <g key={`s${leaf}`}>
                          {line(free, y0, hinge, (y0 + y1) / 2, `s${leaf}a`, '2 1.5')}
                          {line(hinge, (y0 + y1) / 2, free, y1, `s${leaf}b`, '2 1.5')}
                        </g>
                      );
                    })
                  : null}
                {el.fill === 'glass' ? (
                  <g data-symbol="glass" opacity={0.7}>
                    {line(x + 6, y1 - 8, x + Math.min(width - 8, 18), y0 + 8, 'g1')}
                    {line(x + 12, y1 - 8, x + Math.min(width - 6, 24), y0 + 8, 'g2')}
                  </g>
                ) : null}
                {el.fill === 'blank' ? (
                  <g>
                    {line(x, y0, x + width, y1, 'x1')}
                    {line(x + width, y0, x, y1, 'x2')}
                  </g>
                ) : null}
              </g>
            );
          }

          case 'hseam':
            return (
              <g key={i} data-glyph-hseam={el.shares.map((share) => share.toFixed(4)).join(',')}>
                {el.shares.map((share) => (
                  <line
                    key={share}
                    x1={x}
                    y1={y + height * (1 - share)}
                    x2={x + width}
                    y2={y + height * (1 - share)}
                    stroke={LINE}
                    strokeWidth={0.4 * k}
                  />
                ))}
              </g>
            );

          case 'drawer': {
            /*
             * ВЫСОТА ФРОНТА — ЕГО СОБСТВЕННАЯ, А НЕ ДОЛЯ МОДУЛЯ.
             *
             * Здесь стояло `height / el.count` — равные доли. Два ящика
             * 140 + 580 выходили на чертеже как 360 + 360: клиент видел
             * мебель, которой цех не сделает. Высоты приходят из того же
             * наполнения, по которому режется раскрой; здесь они лишь
             * переводятся в масштаб рисунка.
             *
             * Пусто — модуля ещё нет (превью варианта), и доли равные.
             */
            const total = el.heights?.reduce((sum, h) => sum + h, 0) ?? 0;
            const step =
              el.heights && total > 0 ? (el.heights[el.index] / total) * height : height / el.count;
            const above =
              el.heights && total > 0
                ? (el.heights.slice(0, el.index).reduce((sum, h) => sum + h, 0) / total) * height
                : (height / el.count) * el.index;
            const top = y + above;
            return (
              <g key={i} data-symbol="drawer">
                {el.index > 0 && (
                  <line x1={x} y1={top} x2={x + width} y2={top} stroke={LINE} strokeWidth={0.4 * k} />
                )}
                {/* Ряд на два столбца (A4): шов между фасадами по оси перегородки. */}
                {el.leftShare !== undefined && (
                  <line
                    x1={x + width * el.leftShare}
                    y1={top}
                    x2={x + width * el.leftShare}
                    y2={top + step}
                    stroke={LINE}
                    strokeWidth={0.4 * k}
                    data-drawer-seam
                  />
                )}
                {/* Стрелка вперёд: по ней ящик не спутать со створкой. */}
                <g stroke={LINE} strokeWidth={0.5 * k} fill="none" opacity={0.8}>
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
                strokeWidth={0.8 * k}
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
              <g key={i} data-symbol="glass" stroke={LINE} strokeWidth={0.4 * k} opacity={0.7}>
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
                {Array.from({ length: el.count }, (_, row) => (
                  <line
                    key={row}
                    x1={x + 4}
                    y1={y + step * (row + 1)}
                    x2={x + width - 4}
                    y2={y + step * (row + 1)}
                    stroke={LINE}
                    strokeWidth={0.45 * k}
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
            for (let wave = 0; wave < 4; wave += 1) parts.push(`q ${step / 2} -3 ${step} 0`);
            return (
              <path
                key={i}
                d={parts.join(' ')}
                fill="none"
                stroke={LINE}
                strokeWidth={0.5 * k}
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
                strokeWidth={0.35 * k}
                strokeDasharray="3 2"
                data-symbol="open"
              />
            );

          case 'handle': {
            /*
             * РУЧКА НА ЛИСТЕ — В ТОМ ЖЕ ПОЛОЖЕНИИ, ЧТО В СЦЕНЕ.
             *
             * Геометрию считает `handleBoxOf` — та же функция, что ставит
             * ручку на фасад в 3D: второй формулы места в продукте нет, и
             * лист не может показать ручку не там, где она встанет.
             * Полотно здесь — прямоугольник вида, поэтому в функцию идут
             * его центр и габарит в единицах листа.
             */
            const box = handleBoxOf(el.spot, {
              cx: x + width / 2,
              cy: y + height / 2,
              widthM: width,
              heightM: height,
              thicknessM: 0,
            });

            /* У вида ось Y растёт ВНИЗ, у сцены вверх: отражаем по центру. */
            const hy = 2 * (y + height / 2) - box.position[1];

            return (
              <rect
                key={i}
                data-symbol="handle"
                data-handle-place={el.spot.place}
                data-handle-turn={el.spot.turn}
                x={box.position[0] - box.scale[0] / 2}
                y={hy - box.scale[1] / 2}
                width={Math.max(0.8 * k, box.scale[0])}
                height={Math.max(0.8 * k, box.scale[1])}
                fill={LINE}
                opacity={0.75}
              />
            );
          }

          case 'cargo':
            // Вертикальная стрелка выдвижения: карго едет на себя.
            return (
              <g key={i} data-symbol="cargo" stroke={LINE} strokeWidth={0.5 * k} fill="none">
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
              <g key={i} data-symbol="dryer" stroke={LINE} strokeWidth={0.35 * k} strokeDasharray="2 2">
                {Array.from({ length: cells }, (_, cell) => (
                  <line
                    key={cell}
                    x1={x + 5 + ((width - 10) / cells) * cell}
                    y1={y + height * 0.35}
                    x2={x + 5 + ((width - 10) / cells) * cell}
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

          case 'flap':
            return <FlapMark key={i} x={x} y={y} width={width} height={height} />;

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
                strokeWidth={0.4 * k}
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
                strokeWidth={0.4 * k}
                data-symbol="hob"
              />
            );

          case 'hoodDuct':
            return (
              <g key={i} data-symbol="hood" stroke={LINE} strokeWidth={0.4 * k} strokeDasharray="3 2">
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
                  strokeWidth={1.1 * k}
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
