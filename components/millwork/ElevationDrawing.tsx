'use client';

import { useMemo } from 'react';
import DimensionChain from './DimensionChain';
import { APPLIANCE_SLOTS, BASE_TOTAL_H, GEOMETRY, moduleHeightMm } from '@/lib/millwork/modules';
import type { Module, Run } from '@/types/millwork';

/**
 * Вид спереди — главный документ для производства.
 *
 * Модули прямоугольниками, ширина подписана, цепочка размеров снизу,
 * высотные отметки слева, техника условным обозначением. Лист печатается
 * на A4 и вешается на стене объекта, поэтому вся графика — синькой,
 * без заливок и градиентов.
 */

type Props = {
  run: Run;
  selectedModuleId?: string | null;
  onSelect?: (moduleId: string) => void;
  /** Идентификаторы модулей, ширина которых только что изменилась. */
  changedIds?: string[];
};

const PADDING_LEFT = 74;
const PADDING_RIGHT = 26;
const PADDING_TOP = 22;
const CHAIN_HEIGHT = 56;

/** Условное обозначение техники: буква в кружке, как в отраслевых чертежах. */
const APPLIANCE_MARK: Record<string, string> = {
  oven: 'Д',
  hob: 'В',
  hood: 'Вы',
  dishwasher45: 'ПМ',
  dishwasher60: 'ПМ',
  sink600: 'М',
  sink800: 'М',
  fridge: 'Х',
  microwave: 'МВ',
};

export default function ElevationDrawing({
  run,
  selectedModuleId,
  onSelect,
  changedIds = [],
}: Props) {
  const changed = useMemo(() => new Set(changedIds), [changedIds]);

  const ceiling = run.ceilingHeightMm;
  // Масштаб подбирается так, чтобы ряд любой длины уместился по ширине листа.
  const drawWidth = 640;
  const scale = drawWidth / Math.max(run.lengthMm, 1);
  const heightScale = scale;

  const svgHeight = PADDING_TOP + ceiling * heightScale + CHAIN_HEIGHT + 16;
  const svgWidth = PADDING_LEFT + drawWidth + PADDING_RIGHT;

  /** Пол внизу, потолок вверху: экранный Y растёт вниз. */
  const yOf = (mm: number) => PADDING_TOP + (ceiling - mm) * heightScale;

  const upperBottom = GEOMETRY.upper.bottomFromFloor;
  const upperTop = run.options.upperToCeiling
    ? ceiling
    : upperBottom + GEOMETRY.upper.carcassH;

  const marks: [number, string][] = [
    [0, 'пол'],
    [GEOMETRY.base.plinthH, 'цоколь'],
    [BASE_TOTAL_H, 'столешница'],
    ...(run.options.hasUpper
      ? ([
          [upperBottom, 'низ верхних'],
          [upperTop, 'верх верхних'],
        ] as [number, string][])
      : []),
    [ceiling, 'потолок'],
  ];

  const renderModule = (unit: Module, isUpper: boolean) => {
    const x = PADDING_LEFT + unit.offsetMm * scale;
    const w = unit.widthMm * scale;

    const top = isUpper ? upperTop : BASE_TOTAL_H;
    const bottom = isUpper
      ? upperBottom
      : unit.kind === 'tall'
        ? 0
        : GEOMETRY.base.plinthH;

    const tallTop = unit.kind === 'tall' ? moduleHeightMm('tall') : top;
    const yTop = yOf(unit.kind === 'tall' ? tallTop : top);
    const h = yOf(bottom) - yTop;

    const active = selectedModuleId === unit.id;
    const mark = unit.appliance ? APPLIANCE_MARK[unit.appliance] : null;

    return (
      <g
        key={`${isUpper ? 'u' : 'b'}-${unit.id}`}
        onClick={onSelect ? () => onSelect(unit.id) : undefined}
        style={{ cursor: onSelect ? 'pointer' : 'default' }}
      >
        <rect
          x={x}
          y={yTop}
          width={w}
          height={h}
          fill={active ? 'var(--tape)' : 'none'}
          fillOpacity={active ? 0.28 : 0}
          stroke="var(--blueprint)"
          strokeWidth={active ? 1.4 : 0.8}
        />

        {/* Фасады: разделители дверей и ящиков — цех считает по ним петли. */}
        {unit.frontType === 'drawers' &&
          Array.from({ length: unit.drawerCount - 1 }, (_, i) => {
            const step = h / unit.drawerCount;
            const y = yTop + step * (i + 1);
            return (
              <line
                key={i}
                x1={x}
                y1={y}
                x2={x + w}
                y2={y}
                stroke="var(--blueprint)"
                strokeWidth={0.4}
              />
            );
          })}

        {unit.frontType === 'door' && unit.doorCount === 2 && (
          <line
            x1={x + w / 2}
            y1={yTop}
            x2={x + w / 2}
            y2={yTop + h}
            stroke="var(--blueprint)"
            strokeWidth={0.4}
          />
        )}

        {mark && (
          <>
            <circle
              cx={x + w / 2}
              cy={yTop + h / 2}
              r={Math.min(11, w / 2 - 2)}
              fill="none"
              stroke="var(--blueprint)"
              strokeWidth={0.8}
            />
            <text
              x={x + w / 2}
              y={yTop + h / 2 + 3.5}
              textAnchor="middle"
              fontSize={9}
              fill="var(--blueprint)"
            >
              {mark}
            </text>
          </>
        )}

        {unit.isFiller && (
          <text
            className="mw-num"
            x={x + w / 2}
            y={yTop + 11}
            textAnchor="middle"
            fontSize={7}
            fill="var(--alert)"
          >
            добор
          </text>
        )}
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      width="100%"
      role="img"
      aria-label={`Фасадный чертёж ряда ${run.lengthMm} мм`}
    >
      {/* Контур помещения: пол и потолок */}
      <line
        x1={PADDING_LEFT - 12}
        y1={yOf(0)}
        x2={PADDING_LEFT + drawWidth + 8}
        y2={yOf(0)}
        stroke="var(--ink)"
        strokeWidth={1.2}
      />
      <line
        x1={PADDING_LEFT - 12}
        y1={yOf(ceiling)}
        x2={PADDING_LEFT + drawWidth + 8}
        y2={yOf(ceiling)}
        stroke="var(--ink)"
        strokeWidth={0.6}
        strokeDasharray="4 3"
      />

      {/* Высотные отметки слева */}
      {marks.map(([mm, label]) => (
        <g key={label}>
          <line
            x1={PADDING_LEFT - 12}
            y1={yOf(mm)}
            x2={PADDING_LEFT}
            y2={yOf(mm)}
            stroke="var(--blueprint)"
            strokeWidth={0.5}
          />
          <text
            className="mw-num"
            x={PADDING_LEFT - 16}
            y={yOf(mm) - 2}
            textAnchor="end"
            fontSize={8}
            fill="var(--blueprint)"
          >
            {mm}
          </text>
          <text
            x={PADDING_LEFT - 16}
            y={yOf(mm) + 8}
            textAnchor="end"
            fontSize={7}
            fill="var(--graphite-mw)"
          >
            {label}
          </text>
        </g>
      ))}

      {/* Цоколь */}
      <rect
        x={PADDING_LEFT}
        y={yOf(GEOMETRY.base.plinthH)}
        width={drawWidth}
        height={yOf(0) - yOf(GEOMETRY.base.plinthH)}
        fill="var(--concrete-deep)"
        stroke="var(--blueprint)"
        strokeWidth={0.5}
      />

      {/* Столешница */}
      <rect
        x={PADDING_LEFT}
        y={yOf(BASE_TOTAL_H)}
        width={drawWidth}
        height={GEOMETRY.base.countertopH * heightScale}
        fill="var(--concrete-deep)"
        stroke="var(--blueprint)"
        strokeWidth={0.6}
      />

      {run.modules.map((m) => renderModule(m, false))}
      {run.upperSegments.flatMap((segment) =>
        segment.modules.map((m) =>
          renderModule({ ...m, offsetMm: m.offsetMm }, true),
        ),
      )}

      {/* Размерная цепочка — та же, что под лентой модулей и на плане */}
      <g transform={`translate(${PADDING_LEFT}, ${PADDING_TOP + ceiling * heightScale + 8})`}>
        <DimensionChain
          segments={run.modules.map((m) => ({
            id: m.id,
            fromMm: m.offsetMm,
            toMm: m.offsetMm + m.widthMm,
            changed: changed.has(m.id),
            highlighted: selectedModuleId === m.id,
          }))}
          totalMm={run.lengthMm}
          width={drawWidth}
          scale={scale}
          onSelect={onSelect}
        />
      </g>
    </svg>
  );
}

export { APPLIANCE_SLOTS };
