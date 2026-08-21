'use client';

import { useMemo } from 'react';
import { COMM_TITLE, valueOf, type Survey, type SurveyWall } from '@/types/survey';
import type { Module } from '@/types/millwork';

/**
 * План сверху, который дорисовывается по мере ввода.
 *
 * Замерщик обходит комнату и диктует стены — план обязан появляться вместе
 * с ними, а не после. Как только длина стены ряда задана, на ней встаёт
 * предварительный ряд модулей: видно, что помещается, ещё до конца обхода.
 */

type Props = {
  survey: Survey;
  /** Предварительная раскладка вдоль стены ряда. */
  modules?: Module[];
  runWallId?: string;
  highlightAtMm?: number | null;
  onPickWall?: (wallId: string) => void;
  activeWallId?: string | null;
};

type Point = { x: number; y: number };

type Placed = {
  wall: SurveyWall;
  from: Point;
  to: Point;
  lengthMm: number;
  angle: number;
};

/**
 * Цепочка сегментов: каждый следующий отсчитывается от конца предыдущего
 * и поворачивает на заданный угол. Пара «ширина × длина» не годится —
 * реальные кухни бывают Г-образными, с эркерами и коробами.
 */
function walk(walls: SurveyWall[]): Placed[] {
  const placed: Placed[] = [];
  let cursor: Point = { x: 0, y: 0 };
  let heading = 0; // 0° — вправо

  for (const wall of walls) {
    const lengthMm = valueOf(wall.lengthMm) ?? 0;
    const rad = (heading * Math.PI) / 180;
    const to = {
      x: cursor.x + Math.cos(rad) * lengthMm,
      y: cursor.y + Math.sin(rad) * lengthMm,
    };

    placed.push({ wall, from: cursor, to, lengthMm, angle: heading });

    cursor = to;
    heading += wall.turn === 'left' ? -wall.turnDeg : wall.turnDeg;
  }

  return placed;
}

const PAD = 26;

export default function SurveyPlan({
  survey,
  modules = [],
  runWallId,
  highlightAtMm,
  onPickWall,
  activeWallId,
}: Props) {
  const placed = useMemo(() => walk(survey.walls), [survey.walls]);

  const known = placed.filter((p) => p.lengthMm > 0);
  const bounds = useMemo(() => {
    const xs = known.flatMap((p) => [p.from.x, p.to.x]);
    const ys = known.flatMap((p) => [p.from.y, p.to.y]);
    if (xs.length === 0) return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [known]);

  const width = 520;
  const height = 360;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((width - PAD * 2) / spanX, (height - PAD * 2) / spanY);

  const sx = (x: number) => PAD + (x - bounds.minX) * scale;
  const sy = (y: number) => PAD + (y - bounds.minY) * scale;

  const closed =
    known.length > 2 &&
    Math.hypot(
      known[known.length - 1].to.x - known[0].from.x,
      known[known.length - 1].to.y - known[0].from.y,
    ) <
      Math.max(60, spanX * 0.04);

  if (known.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center border border-blueprint/30 bg-sheet px-6 text-center text-[12px] leading-snug text-graphiteMw">
        План появится, как только вы введёте длину первой стены.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full border border-blueprint/30 bg-sheet"
      role="img"
      aria-label="План помещения"
    >
      {/* Стены */}
      {placed.map((p) => {
        if (p.lengthMm <= 0) return null;
        const isRun = p.wall.id === runWallId;
        const isActive = p.wall.id === activeWallId;

        const midX = (sx(p.from.x) + sx(p.to.x)) / 2;
        const midY = (sy(p.from.y) + sy(p.to.y)) / 2;
        const assumedLength = p.wall.lengthMm.state === 'assumed';

        return (
          <g key={p.wall.id} onClick={() => onPickWall?.(p.wall.id)} className="cursor-pointer">
            <line
              x1={sx(p.from.x)}
              y1={sy(p.from.y)}
              x2={sx(p.to.x)}
              y2={sy(p.to.y)}
              stroke={isRun ? 'var(--cyan-bright)' : 'var(--blueprint)'}
              strokeWidth={isActive ? 4 : isRun ? 3 : 2}
              // Допущение читается как пунктир — отраслевая норма.
              strokeDasharray={assumedLength ? '6 4' : undefined}
            />
            <text
              className="mw-num"
              x={midX}
              y={midY - 6}
              textAnchor="middle"
              fontSize={10}
              fill={isRun ? 'var(--cyan-bright)' : 'var(--graphite-mw)'}
            >
              {p.lengthMm}
            </text>
          </g>
        );
      })}

      {/* Проёмы: окно белым, дверь разрывом */}
      {placed.map((p) =>
        p.wall.openings.map((opening) => {
          const from = valueOf(opening.fromCornerMm);
          const openWidth = valueOf(opening.widthMm);
          if (from === undefined || openWidth === undefined || p.lengthMm <= 0) return null;

          const t1 = from / p.lengthMm;
          const t2 = (from + openWidth) / p.lengthMm;
          const at = (t: number) => ({
            x: p.from.x + (p.to.x - p.from.x) * t,
            y: p.from.y + (p.to.y - p.from.y) * t,
          });
          const a = at(Math.min(1, t1));
          const b = at(Math.min(1, t2));
          const assumedSpot =
            opening.fromCornerMm.state === 'assumed' || opening.widthMm.state === 'assumed';

          return (
            <g key={opening.id}>
              <line
                x1={sx(a.x)}
                y1={sy(a.y)}
                x2={sx(b.x)}
                y2={sy(b.y)}
                stroke={opening.kind === 'door' || opening.kind === 'arch' ? 'var(--tape)' : 'var(--sheet)'}
                strokeWidth={6}
                strokeDasharray={assumedSpot ? '4 3' : undefined}
              />
              <text
                className="mw-num"
                x={(sx(a.x) + sx(b.x)) / 2}
                y={(sy(a.y) + sy(b.y)) / 2 + 12}
                textAnchor="middle"
                fontSize={8}
                fill="var(--graphite-mw)"
              >
                {opening.kind === 'window' ? 'окно' : opening.kind === 'door' ? 'дверь' : opening.kind}
              </text>
            </g>
          );
        }),
      )}

      {/* Предварительный ряд вдоль стены ряда */}
      {(() => {
        const run = placed.find((p) => p.wall.id === runWallId);
        if (!run || run.lengthMm <= 0 || modules.length === 0) return null;

        const nx = (run.to.x - run.from.x) / run.lengthMm;
        const ny = (run.to.y - run.from.y) / run.lengthMm;
        // Ряд рисуется полосой внутрь помещения, глубиной 600 мм.
        const px = -ny * 600;
        const py = nx * 600;

        return modules.map((unit) => {
          const a = {
            x: run.from.x + nx * unit.offsetMm,
            y: run.from.y + ny * unit.offsetMm,
          };
          const b = {
            x: run.from.x + nx * (unit.offsetMm + unit.widthMm),
            y: run.from.y + ny * (unit.offsetMm + unit.widthMm),
          };

          return (
            <polygon
              key={unit.id}
              points={[
                `${sx(a.x)},${sy(a.y)}`,
                `${sx(b.x)},${sy(b.y)}`,
                `${sx(b.x + px)},${sy(b.y + py)}`,
                `${sx(a.x + px)},${sy(a.y + py)}`,
              ].join(' ')}
              fill="none"
              stroke="var(--cyan)"
              strokeWidth={1}
            />
          );
        });
      })()}

      {/* Коммуникации */}
      {survey.comms.map((comm) => {
        const wall = placed.find((p) => p.wall.id === comm.wallId);
        const from = valueOf(comm.fromCornerMm);
        if (!wall || wall.lengthMm <= 0 || from === undefined) return null;

        const t = Math.min(1, from / wall.lengthMm);
        const point = {
          x: wall.from.x + (wall.to.x - wall.from.x) * t,
          y: wall.from.y + (wall.to.y - wall.from.y) * t,
        };

        return (
          <g key={comm.id}>
            <circle cx={sx(point.x)} cy={sy(point.y)} r={4} fill="var(--tape)" />
            <text
              className="mw-num"
              x={sx(point.x)}
              y={sy(point.y) - 8}
              textAnchor="middle"
              fontSize={7}
              fill="var(--tape)"
            >
              {COMM_TITLE[comm.kind]}
            </text>
          </g>
        );
      })}

      {/* Метка предупреждения */}
      {(() => {
        const run = placed.find((p) => p.wall.id === runWallId);
        if (!run || highlightAtMm == null || run.lengthMm <= 0) return null;
        const t = Math.min(1, highlightAtMm / run.lengthMm);
        const point = {
          x: run.from.x + (run.to.x - run.from.x) * t,
          y: run.from.y + (run.to.y - run.from.y) * t,
        };
        return (
          <circle
            cx={sx(point.x)}
            cy={sy(point.y)}
            r={9}
            fill="none"
            stroke="var(--alert)"
            strokeWidth={2}
          />
        );
      })()}

      <text className="mw-num" x={PAD} y={height - 8} fontSize={9} fill="var(--graphite-mw)">
        {closed ? 'контур замкнут' : 'контур не замкнут'}
      </text>
    </svg>
  );
}
