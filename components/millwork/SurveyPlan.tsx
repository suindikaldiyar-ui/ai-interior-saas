'use client';

import { useMemo } from 'react';
import { COMM_TITLE, valueOf, type Survey } from '@/types/survey';
import { OPENING_KIND_TITLE, type Module } from '@/types/millwork';
import { interiorSide, leftCornerOf, pointFromLeft, surveyWalk } from '@/lib/millwork/surveyPlan';

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

/*
 * Цепочка сегментов — `surveyWalk`: тот же обход строит план комнаты
 * Studio, и второй копии формулы нет (STAGE 01B). Сторона комнаты и
 * «от левого угла» — те же `interiorSide` и `pointFromLeft`: у обхода
 * «налево» левый угол стены — её конец, и ряд встаёт с той стороны,
 * где комната, а не снаружи.
 */

const PAD = 26;

export default function SurveyPlan({
  survey,
  modules = [],
  runWallId,
  highlightAtMm,
  onPickWall,
  activeWallId,
}: Props) {
  const rotation = survey.planRotationDeg ?? 0;
  const placed = useMemo(() => surveyWalk(survey.walls, rotation), [survey.walls, rotation]);
  const side = interiorSide(survey.walls, survey.interior);
  const leftEnd = leftCornerOf(survey, side);

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
          <g key={p.wall.id} data-survey-wall={p.wall.id} onClick={() => onPickWall?.(p.wall.id)} className="cursor-pointer">
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

          const a = pointFromLeft(p, Math.min(p.lengthMm, from), leftEnd);
          const b = pointFromLeft(p, Math.min(p.lengthMm, from + openWidth), leftEnd);
          const assumedSpot =
            opening.fromCornerMm.state === 'assumed' || opening.widthMm.state === 'assumed';

          return (
            <g key={opening.id} data-survey-opening={opening.id}>
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
                {/* Название вида — одна таблица на продукт (ловушка 382): сырой ключ замерщику не показывается. */}
                {OPENING_KIND_TITLE[opening.kind].toLowerCase()}
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
        const px = -ny * 600 * side;
        const py = nx * 600 * side;

        return modules.map((unit) => {
          const a = pointFromLeft(run, unit.offsetMm, leftEnd);
          const b = pointFromLeft(run, unit.offsetMm + unit.widthMm, leftEnd);

          return (
            <polygon
              key={unit.id}
              data-survey-module={unit.id}
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

        const point = pointFromLeft(wall, Math.min(wall.lengthMm, from), leftEnd);

        return (
          <g key={comm.id} data-survey-comm={comm.id}>
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
        const point = pointFromLeft(run, Math.min(run.lengthMm, highlightAtMm), leftEnd);
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
