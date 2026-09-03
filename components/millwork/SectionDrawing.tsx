'use client';

import { GEOMETRY } from '@/lib/millwork/modules';
import { zoneProfile } from '@/lib/millwork/zones';
import type { Run } from '@/types/millwork';

/**
 * БОКОВОЙ РАЗРЕЗ.
 *
 * Вид сбоку отвечает на вопросы, которых нет ни на фасаде, ни на плане:
 * какая глубина корпуса, на какой высоте столешница, насколько она свисает,
 * куда утоплен цоколь и сколько остаётся до верхнего ряда. Монтажник смотрит
 * именно сюда, когда прикидывает, пройдёт ли мебель мимо подоконника.
 *
 * Рисуется В МИЛЛИМЕТРАХ: `viewBox` совпадает с натурой, поэтому масштаб на
 * бумаге получается делением, а не подгонкой. Числа — те же `GEOMETRY`, что
 * держат раскладку: второй набор развёл бы разрез с чертежом.
 */

/** Поля вокруг разреза, миллиметры натуры. */
const PAD_LEFT = 260;
const PAD_RIGHT = 200;
const PAD_TOP = 90;
const PAD_BOTTOM = 150;

type Props = {
  run: Run;
  /** Разрез с наполнением: полки и штанги видны, фасады сняты. */
  inside?: boolean;
};

/** Габарит разреза в натуре — по нему считается масштаб на листе. */
export function sectionSizeMm(run: Run): { width: number; height: number } {
  const depth = Math.max(GEOMETRY.base.depth, GEOMETRY.base.countertopDepth) + 40;
  return {
    width: PAD_LEFT + depth + PAD_RIGHT,
    height: PAD_TOP + run.ceilingHeightMm + PAD_BOTTOM,
  };
}

export default function SectionDrawing({ run, inside = false }: Props) {
  const zone = zoneProfile(run.zone ?? 'kitchen');
  const size = sectionSizeMm(run);
  const ceiling = run.ceilingHeightMm;

  /** Пол внизу, потолок вверху: экранный Y растёт вниз. */
  const yOf = (mm: number) => PAD_TOP + (ceiling - mm);
  /** Стена слева, перёд мебели справа. */
  const xOf = (mm: number) => PAD_LEFT + mm;

  const base = GEOMETRY.base;
  const upper = GEOMETRY.upper;

  const baseDepth = zone.depthMm ?? base.depth;
  const counterTop = base.plinthH + base.carcassH + base.countertopH;
  const hasUpper = run.upperSegments.length > 0;
  const upperTop = run.options.upperToCeiling ? ceiling : upper.bottomFromFloor + upper.carcassH;

  const line = 'var(--blueprint)';

  return (
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      width="100%"
      role="img"
      aria-label={`Боковой разрез ряда, глубина ${baseDepth} мм`}
    >
      {/* Стена и пол: от них считаются все привязки. */}
      <line x1={xOf(0)} y1={yOf(ceiling)} x2={xOf(0)} y2={yOf(0)} stroke={line} strokeWidth={6} />
      <line
        x1={xOf(-120)}
        y1={yOf(0)}
        x2={xOf(baseDepth + 160)}
        y2={yOf(0)}
        stroke={line}
        strokeWidth={6}
      />
      <line
        x1={xOf(-120)}
        y1={yOf(ceiling)}
        x2={xOf(baseDepth + 160)}
        y2={yOf(ceiling)}
        stroke={line}
        strokeWidth={3}
        strokeDasharray="24 18"
      />

      {/* Цоколь: утоплен на 50 мм — по этой ступеньке мебель стоит на полу. */}
      <rect
        x={xOf(50)}
        y={yOf(base.plinthH)}
        width={baseDepth - 50}
        height={base.plinthH}
        fill="none"
        stroke={line}
        strokeWidth={3}
      />

      {/* Корпус нижнего ряда. */}
      <rect
        x={xOf(0)}
        y={yOf(base.plinthH + base.carcassH)}
        width={baseDepth}
        height={base.carcassH}
        fill="none"
        stroke={line}
        strokeWidth={4}
      />

      {/* Наполнение: полки идут по системе 32, штанга — труба поперёк. */}
      {inside &&
        [0.33, 0.66].map((k) => (
          <line
            key={k}
            x1={xOf(16)}
            y1={yOf(base.plinthH + base.carcassH * k)}
            x2={xOf(baseDepth - 16)}
            y2={yOf(base.plinthH + base.carcassH * k)}
            stroke={line}
            strokeWidth={3}
          />
        ))}

      {/* Фасад впереди корпуса — на свою толщину. */}
      {!inside && (
        <rect
          x={xOf(baseDepth)}
          y={yOf(base.plinthH + base.carcassH)}
          width={base.frontDepth}
          height={base.carcassH}
          fill="none"
          stroke={line}
          strokeWidth={3}
        />
      )}

      {/* Столешница со свесом: торец 38 мм — по нему ряд читается кухней. */}
      {zone.hasCountertop && (
        <rect
          x={xOf(0)}
          y={yOf(counterTop)}
          width={base.countertopDepth}
          height={base.countertopH}
          fill="none"
          stroke={line}
          strokeWidth={4}
        />
      )}

      {/* Верхний ряд. */}
      {hasUpper && (
        <>
          <rect
            x={xOf(0)}
            y={yOf(upperTop)}
            width={upper.depth}
            height={upperTop - upper.bottomFromFloor}
            fill="none"
            stroke={line}
            strokeWidth={4}
          />
          {inside &&
            [0.5].map((k) => (
              <line
                key={k}
                x1={xOf(16)}
                y1={yOf(upper.bottomFromFloor + (upperTop - upper.bottomFromFloor) * k)}
                x2={xOf(upper.depth - 16)}
                y2={yOf(upper.bottomFromFloor + (upperTop - upper.bottomFromFloor) * k)}
                stroke={line}
                strokeWidth={3}
              />
            ))}
        </>
      )}

      {/* ── Размеры. Вертикальная цепочка слева, глубина снизу ── */}
      <Vertical from={0} to={counterTop} x={-70} label={`${counterTop}`} yOf={yOf} xOf={xOf} />
      {hasUpper && (
        <Vertical
          from={counterTop}
          to={upper.bottomFromFloor}
          x={-160}
          label={`${upper.bottomFromFloor - counterTop}`}
          yOf={yOf}
          xOf={xOf}
        />
      )}
      <Vertical from={0} to={ceiling} x={-235} label={`${ceiling}`} yOf={yOf} xOf={xOf} />

      <Horizontal from={0} to={baseDepth} y={-70} label={`${baseDepth}`} yOf={yOf} xOf={xOf} />
      {zone.hasCountertop && (
        <Horizontal
          from={0}
          to={base.countertopDepth}
          y={-140}
          label={`${base.countertopDepth}`}
          yOf={yOf}
          xOf={xOf}
        />
      )}
    </svg>
  );
}

/* ─────────────────────────  Размерные линии  ───────────────────────── */

type DimProps = {
  label: string;
  yOf: (mm: number) => number;
  xOf: (mm: number) => number;
};

function Vertical({
  from,
  to,
  x,
  label,
  yOf,
  xOf,
}: DimProps & { from: number; to: number; x: number }) {
  const px = xOf(x);
  return (
    <g stroke="var(--blueprint)" strokeWidth={2}>
      <line x1={px} y1={yOf(from)} x2={px} y2={yOf(to)} />
      <line x1={px - 20} y1={yOf(from)} x2={px + 20} y2={yOf(from)} />
      <line x1={px - 20} y1={yOf(to)} x2={px + 20} y2={yOf(to)} />
      <text
        className="mw-num"
        x={px - 12}
        y={(yOf(from) + yOf(to)) / 2}
        fontSize={62}
        fill="var(--blueprint)"
        stroke="none"
        textAnchor="middle"
        transform={`rotate(-90 ${px - 12} ${(yOf(from) + yOf(to)) / 2})`}
      >
        {label}
      </text>
    </g>
  );
}

function Horizontal({
  from,
  to,
  y,
  label,
  yOf,
  xOf,
}: DimProps & { from: number; to: number; y: number }) {
  const py = yOf(y);
  return (
    <g stroke="var(--blueprint)" strokeWidth={2}>
      <line x1={xOf(from)} y1={py} x2={xOf(to)} y2={py} />
      <line x1={xOf(from)} y1={py - 20} x2={xOf(from)} y2={py + 20} />
      <line x1={xOf(to)} y1={py - 20} x2={xOf(to)} y2={py + 20} />
      <text
        className="mw-num"
        x={(xOf(from) + xOf(to)) / 2}
        y={py - 18}
        fontSize={62}
        fill="var(--blueprint)"
        stroke="none"
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}
