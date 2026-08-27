'use client';

import { useEffect, useMemo, useRef } from 'react';
import DimensionChain from './DimensionChain';
import { APPLIANCE_SLOTS, BASE_TOTAL_H, GEOMETRY, moduleHeightMm } from '@/lib/millwork/modules';
import { sectionSpec } from '@/lib/millwork/sections';
import { zoneHeightMm, zoneProfile } from '@/lib/millwork/zones';
import {
  addShelf,
  flipHinge,
  moduleCarcassHeightMm,
  moveDivider,
  moveDrawerBoundary,
  moveShelf,
  removeShelf,
  snapTo32,
} from '@/lib/millwork/fill';
import type { Module, ModuleFill, Run } from '@/types/millwork';

/**
 * Вид спереди — главный документ для производства.
 *
 * Модули прямоугольниками, ширина подписана, цепочка размеров снизу,
 * высотные отметки слева, техника условным обозначением. Лист печатается
 * на A4 и вешается на стене объекта, поэтому вся графика — синькой,
 * без заливок и градиентов.
 */

/**
 * Два вида одного эскиза.
 *
 * «С фасадами» — вид для клиента: контуры модулей, двери, ширины, размерная
 * цепочка. «Внутри» — разрез для цеха и для разговора «а куда я поставлю
 * кастрюли»: полки с высотами, перегородки, штанги, ящики. Фасады на нём
 * не рисуются — они закрывают ровно то, ради чего этот вид смотрят.
 */
export type DrawingMode = 'fronts' | 'inside';

type Props = {
  run: Run;
  /** Габарит получен из допущения — на чертеже он идёт пунктиром. */
  assumedTotal?: boolean;
  selectedModuleId?: string | null;
  onSelect?: (moduleId: string) => void;
  /** Идентификаторы модулей, ширина которых только что изменилась. */
  changedIds?: string[];
  mode?: DrawingMode;
  /** Правка наполнения перетаскиванием. Без неё вид «внутри» только читается. */
  onFillChange?: (moduleId: string, fill: ModuleFill) => void;
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

/**
 * Метка направления открывания: треугольник в углу двери со стороны ручки.
 * Клик по метке меняет сторону — числа замерщик не вводит.
 */
function HingeMark({
  hinge,
  doorCount,
  x,
  width,
  yTop,
  height,
  onFlip,
}: {
  hinge: ModuleFill['hinge'];
  doorCount: number;
  x: number;
  width: number;
  yTop: number;
  height: number;
  onFlip?: () => void;
}) {
  // У двух дверей стороны очевидны: левая налево, правая направо.
  if (doorCount !== 1 || hinge === 'none') return null;

  const size = Math.min(12, width / 3);
  const midY = yTop + height / 2;
  // Вершина треугольника смотрит на петлю, основание — на ручку.
  const points =
    hinge === 'left'
      ? `${x + 2},${midY} ${x + 2 + size},${midY - size / 2} ${x + 2 + size},${midY + size / 2}`
      : `${x + width - 2},${midY} ${x + width - 2 - size},${midY - size / 2} ${x + width - 2 - size},${midY + size / 2}`;

  return (
    <polygon
      points={points}
      fill="var(--blueprint)"
      fillOpacity={0.55}
      stroke="var(--blueprint)"
      strokeWidth={0.4}
      style={{ cursor: onFlip ? 'pointer' : 'default' }}
      onClick={
        onFlip
          ? (event) => {
              event.stopPropagation();
              onFlip();
            }
          : undefined
      }
    >
      <title>{hinge === 'left' ? 'Петли слева' : 'Петли справа'}</title>
    </polygon>
  );
}

/**
 * Разрез модуля: полки, перегородка, штанги, ящики.
 *
 * ПРАВКА ПЕРЕТАСКИВАНИЕМ. Замерщик не вводит числа — он тянет. Правила
 * производительности те же, что у шторки сравнения: `pointermove` живёт
 * только между `pointerdown` и `pointerup`, позиция пишется прямо в DOM,
 * а `setState` случается ОДИН раз, на отпускании.
 */
function ModuleInside({
  unit,
  x,
  width,
  yTop,
  height,
  heightMm,
  onFillChange,
}: {
  unit: Module;
  x: number;
  width: number;
  yTop: number;
  height: number;
  heightMm: number;
  onFillChange?: (moduleId: string, fill: ModuleFill) => void;
}) {
  const fill = unit.fill;
  const drag = useRef<(() => void) | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => () => drag.current?.(), []);

  if (!fill || unit.kind === 'filler' || unit.appliance) return null;

  const scaleY = height / Math.max(heightMm, 1);
  /** Экранный Y по высоте от дна корпуса. */
  const yAt = (mm: number) => yTop + height - mm * scaleY;
  /** Общая обвязка перетаскивания: слушатели живут только на время жеста. */
  const startDrag = (
    event: React.PointerEvent,
    onMove: (mm: number) => void,
    onEnd: (mm: number) => void,
  ) => {
    event.stopPropagation();
    const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
    if (!svg) return;

    const box = svg.getBoundingClientRect();
    const viewH = svg.viewBox.baseVal.height || box.height;
    const toMm = (clientY: number) => {
      const localY = ((clientY - box.top) / box.height) * viewH;
      return Math.round((yTop + height - localY) / scaleY);
    };

    let last = toMm(event.clientY);
    drag.current?.();

    const move = (e: PointerEvent) => {
      const mm = toMm(e.clientY);
      if (raf.current !== null) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        last = mm;
        onMove(mm);
      });
    };

    const up = () => {
      drag.current?.();
      onEnd(last);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    drag.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      drag.current = null;
    };
  };

  const editable = Boolean(onFillChange);
  const inner = { x: x + 2, width: Math.max(0, width - 4) };

  return (
    <g>
      {/* Корпус: внутренний контур, чтобы полки читались внутри него. */}
      <rect
        x={inner.x}
        y={yTop + 2}
        width={inner.width}
        height={Math.max(0, height - 4)}
        fill="none"
        stroke="var(--blueprint)"
        strokeWidth={0.4}
        strokeDasharray="3 2"
      />

      {/*
        * Пустое место: двойной клик ставит сюда полку. Прямоугольник идёт
        * ПЕРЕД полками — нарисованный после них, он перехватывал нажатия,
        * и полка переставала тянуться.
        */}
      {editable && (
        <rect
          x={inner.x}
          y={yTop + 2}
          width={inner.width}
          height={Math.max(0, height - 4)}
          fill="transparent"
          onDoubleClick={(event) => {
            event.stopPropagation();
            const svg = (event.currentTarget as SVGRectElement).ownerSVGElement;
            if (!svg) return;
            const box = svg.getBoundingClientRect();
            const viewH = svg.viewBox.baseVal.height || box.height;
            const localY = ((event.clientY - box.top) / box.height) * viewH;
            const mm = Math.round((yTop + height - localY) / scaleY);
            onFillChange?.(unit.id, addShelf(fill, mm, heightMm));
          }}
        />
      )}

      {/* Полки: сплошные линии с высотой от пола. */}
      {fill.shelves.map((mm, i) => (
        <g key={`shelf-${i}`}>
          <line
            data-shelf={i}
            x1={inner.x}
            y1={yAt(mm)}
            x2={inner.x + inner.width}
            y2={yAt(mm)}
            stroke="var(--blueprint)"
            strokeWidth={1.2}
            style={{ cursor: editable ? 'ns-resize' : 'default' }}
            onPointerDown={
              editable
                ? (event) => {
                    const line = event.currentTarget as SVGLineElement;
                    const label = line.parentElement?.querySelector('text');
                    startDrag(
                      event,
                      (value) => {
                        const snapped = snapTo32(value);
                        line.setAttribute('y1', String(yAt(snapped)));
                        line.setAttribute('y2', String(yAt(snapped)));
                        if (label) {
                          label.setAttribute('y', String(yAt(snapped) - 3));
                          label.textContent = String(snapped);
                        }
                      },
                      (value) => onFillChange?.(unit.id, moveShelf(fill, i, value, heightMm)),
                    );
                  }
                : undefined
            }
            onDoubleClick={
              editable
                ? (event) => {
                    event.stopPropagation();
                    onFillChange?.(unit.id, removeShelf(fill, i));
                  }
                : undefined
            }
          />
          <text
            className="mw-num"
            x={inner.x + 3}
            y={yAt(mm) - 3}
            fontSize={7}
            fill="var(--graphite-mw)"
          >
            {mm}
          </text>
        </g>
      ))}

      {/* Перегородка: ходит влево-вправо шагом 32 мм. */}
      {fill.dividerMm > 0 && (
        <line
          x1={x + fill.dividerMm * (width / Math.max(unit.widthMm, 1))}
          y1={yTop + 2}
          x2={x + fill.dividerMm * (width / Math.max(unit.widthMm, 1))}
          y2={yTop + height - 2}
          stroke="var(--blueprint)"
          strokeWidth={1.2}
          style={{ cursor: editable ? 'ew-resize' : 'default' }}
          onPointerDown={
            editable
              ? (event) => {
                  event.stopPropagation();
                  const line = event.currentTarget as SVGLineElement;
                  const svg = line.ownerSVGElement;
                  if (!svg) return;
                  const box = svg.getBoundingClientRect();
                  const viewW = svg.viewBox.baseVal.width || box.width;
                  const scaleX = width / Math.max(unit.widthMm, 1);
                  const toMm = (clientX: number) => {
                    const localX = ((clientX - box.left) / box.width) * viewW;
                    return Math.round((localX - x) / scaleX);
                  };

                  let last = toMm(event.clientX);
                  const move = (e: PointerEvent) => {
                    last = toMm(e.clientX);
                    const at = x + Math.max(0, last) * scaleX;
                    line.setAttribute('x1', String(at));
                    line.setAttribute('x2', String(at));
                  };
                  const up = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    onFillChange?.(unit.id, moveDivider(fill, last, unit.widthMm));
                  };
                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', up);
                }
              : undefined
          }
        />
      )}

      {/* Штанга: условное обозначение — кружок с осью. */}
      {fill.rodsMm.map((mm, i) => (
        <g key={`rod-${i}`}>
          <line
            x1={inner.x + 6}
            y1={yAt(mm)}
            x2={inner.x + inner.width - 6}
            y2={yAt(mm)}
            stroke="var(--blueprint)"
            strokeWidth={0.8}
            strokeDasharray="6 3"
          />
          <circle
            cx={inner.x + inner.width / 2}
            cy={yAt(mm)}
            r={3}
            fill="none"
            stroke="var(--blueprint)"
            strokeWidth={0.8}
          />
          <text
            className="mw-num"
            x={inner.x + inner.width - 6}
            y={yAt(mm) - 3}
            textAnchor="end"
            fontSize={7}
            fill="var(--graphite-mw)"
          >
            штанга {mm}
          </text>
        </g>
      ))}

      {/* Ящики: отдельными прямоугольниками, границы тянутся. */}
      {fill.drawerHeights.length > 0 &&
        fill.drawerHeights.map((front, i) => {
          const above = fill.drawerHeights.slice(0, i).reduce((sum, h) => sum + h, 0);
          const top = yTop + above * scaleY;
          const boxH = front * scaleY;

          return (
            <g key={`drawer-${i}`}>
              <rect
                x={inner.x + 2}
                y={top + 1}
                width={Math.max(0, inner.width - 4)}
                height={Math.max(0, boxH - 2)}
                fill="none"
                stroke="var(--blueprint)"
                strokeWidth={0.6}
              />
              <text
                className="mw-num"
                x={inner.x + inner.width / 2}
                y={top + boxH / 2 + 3}
                textAnchor="middle"
                fontSize={7}
                fill="var(--graphite-mw)"
              >
                {front}
              </text>

              {/* Граница между ящиками: тянем, сумма высот не меняется. */}
              {editable && i < fill.drawerHeights.length - 1 && (
                <line
                  x1={inner.x}
                  y1={top + boxH}
                  x2={inner.x + inner.width}
                  y2={top + boxH}
                  stroke="transparent"
                  strokeWidth={6}
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={(event) => {
                    const startMm = (yTop + height - event.clientY) / scaleY;
                    startDrag(
                      event,
                      () => undefined,
                      (value) => {
                        // Тянем вниз — верхний фронт растёт.
                        const delta = Math.round(startMm - value);
                        onFillChange?.(unit.id, moveDrawerBoundary(fill, i, delta));
                      },
                    );
                  }}
                />
              )}
            </g>
          );
        })}

      {/* Пустая секция: сказать прямо, а не оставлять белое место. */}
      {fill.shelves.length === 0 &&
        fill.rodsMm.length === 0 &&
        fill.drawerHeights.length === 0 && (
          <text
            x={x + width / 2}
            y={yTop + height / 2}
            textAnchor="middle"
            fontSize={7}
            fill="var(--graphite-mw)"
          >
            без наполнения
          </text>
        )}
    </g>
  );
}

export default function ElevationDrawing({
  run,
  assumedTotal = false,
  selectedModuleId,
  onSelect,
  changedIds = [],
  mode = 'fronts',
  onFillChange,
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

  /*
   * Зона решает, что вообще есть на чертеже. Подписывать «столешница» и
   * «низ верхних» в шкафу-купе нельзя: этих отметок там не существует,
   * а чертёж читает цех и монтажник.
   */
  const zone = zoneProfile(run.zone);
  const sectionZone = Boolean(run.zone) && run.zone !== 'kitchen';
  const zoneTop = Math.min(zoneHeightMm(run.zone, ceiling), ceiling);

  const marks: [number, string][] = sectionZone
    ? [
        [0, 'пол'],
        [GEOMETRY.base.plinthH, 'цоколь'],
        ...(zone.hasCountertop ? ([[zoneTop, 'столешница']] as [number, string][]) : []),
        ...(zone.hasCountertop ? [] : ([[zoneTop, 'верх ряда']] as [number, string][])),
        [ceiling, 'потолок'],
      ]
    : [
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

  /** Верх и низ модуля секционной зоны: у каждой секции своя высота. */
  const sectionBounds = (unit: Module, isUpper: boolean): { top: number; bottom: number } => {
    const spec = unit.section ? sectionSpec(unit.section) : null;

    // Антресоль и подвесные модули висят, остальное стоит на цоколе.
    if (isUpper || spec?.moduleKind === 'upper') {
      const height = spec?.heightMm || GEOMETRY.upper.carcassH;
      return { top: zoneTop, bottom: Math.max(0, zoneTop - height) };
    }

    if (spec && spec.heightMm > 0 && spec.moduleKind === 'base') {
      return { top: spec.heightMm, bottom: GEOMETRY.base.plinthH };
    }

    return { top: zoneTop, bottom: GEOMETRY.base.plinthH };
  };

  const renderModule = (unit: Module, isUpper: boolean) => {
    const x = PADDING_LEFT + unit.offsetMm * scale;
    const w = unit.widthMm * scale;

    const bounds = sectionZone
      ? sectionBounds(unit, isUpper)
      : { top: isUpper ? upperTop : BASE_TOTAL_H, bottom: isUpper ? upperBottom : 0 };
    const top = bounds.top;
    const bottom = bounds.bottom;

    /*
     * У кухни пенал выше нижнего ряда и берёт свою стандартную высоту.
     * В секционных зонах высоту уже посчитала сама секция: штанга под
     * пальто и обувница — это разные высоты, а не «пенал».
     */
    const tallTop = !sectionZone && unit.kind === 'tall' ? moduleHeightMm('tall') : top;
    const yTop = yOf(tallTop);
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

        {/* Наполнение: полки, штанги, ящики. Фасады на этом виде не рисуются. */}
        {mode === 'inside' && (
          <ModuleInside
            unit={unit}
            x={x}
            width={w}
            yTop={yTop}
            height={h}
            heightMm={moduleCarcassHeightMm(unit, run)}
            onFillChange={onFillChange}
          />
        )}

        {/* Фасады: разделители дверей и ящиков — цех считает по ним петли. */}
        {mode === 'fronts' && unit.frontType === 'drawers' &&
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

        {mode === 'fronts' && unit.frontType === 'door' && unit.doorCount === 2 && (
          <line
            x1={x + w / 2}
            y1={yTop}
            x2={x + w / 2}
            y2={yTop + h}
            stroke="var(--blueprint)"
            strokeWidth={0.4}
          />
        )}

        {/*
          * Треугольник направления открывания. Одна метка — и цех не
          * ошибётся стороной петель; это отраслевое обозначение, его не
          * нужно объяснять.
          */}
        {mode === 'fronts' && unit.frontType === 'door' && unit.fill && (
          <HingeMark
            hinge={unit.fill.hinge}
            doorCount={unit.doorCount}
            x={x}
            width={w}
            yTop={yTop}
            height={h}
            onFlip={
              onFillChange && unit.fill.hinge !== 'none'
                ? () => onFillChange(unit.id, flipHinge(unit.fill as ModuleFill))
                : undefined
            }
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

        {/* Добор — вынужденная планка. Нестандартная ширина — норма заказной мебели. */}
        {unit.isFiller && (
          <text
            className="mw-num"
            x={x + w / 2}
            y={yTop + 11}
            textAnchor="middle"
            fontSize={7}
            fill={unit.kind === 'filler' ? 'var(--alert)' : 'var(--graphite-mw)'}
          >
            {unit.kind === 'filler' ? 'добор' : 'нестандарт'}
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

      {/* Цоколь и столешница — контуром, а не заливкой: сплошная плашка
          на печати схлопывается в чёрную полосу, а на синьке не читается. */}
      <rect
        x={PADDING_LEFT}
        y={yOf(GEOMETRY.base.plinthH)}
        width={drawWidth}
        height={yOf(0) - yOf(GEOMETRY.base.plinthH)}
        fill="none"
        stroke="var(--blueprint)"
        strokeWidth={0.5}
      />

      {/* Столешница есть не в каждой зоне: в шкафу её нет вовсе. */}
      {(!sectionZone || zone.hasCountertop) && (
        <rect
          x={PADDING_LEFT}
          y={yOf(sectionZone ? zoneTop : BASE_TOTAL_H)}
          width={drawWidth}
          height={GEOMETRY.base.countertopH * heightScale}
          fill="none"
          stroke="var(--blueprint)"
          strokeWidth={1}
        />
      )}

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
          assumedTotal={assumedTotal}
          width={drawWidth}
          scale={scale}
          onSelect={onSelect}
        />
      </g>
    </svg>
  );
}

export { APPLIANCE_SLOTS };
