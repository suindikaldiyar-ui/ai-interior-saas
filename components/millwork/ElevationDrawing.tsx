'use client';

import { useEffect, useMemo, useRef } from 'react';
import DimensionChain from './DimensionChain';
import { APPLIANCE_SLOTS, BASE_TOTAL_H, GEOMETRY, moduleHeightMm } from '@/lib/millwork/modules';
import { sectionSpec } from '@/lib/millwork/sections';
import { zoneHeightMm, zoneProfile } from '@/lib/millwork/zones';
import {
  addShelf,
  columnNiches,
  flipHinge,
  moduleCarcassHeightMm,
  moveDivider,
  moveDrawerBoundary,
  moveShelf,
  removeShelf,
  snapTo32,
} from '@/lib/millwork/fill';
import { formatMoney } from '@/lib/millwork/estimate';
import type {
  ApplianceKind,
  Module,
  ModuleFill,
  ModuleVariantKind,
  Run,
} from '@/types/millwork';

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
  /**
   * Перенос прибора мышью: центр от левого края ряда, мм.
   *
   * Алгоритм ставит мойку к воде, а варочную не у края — верные умолчания.
   * Но на объекте замерщик видит то, чего алгоритм не знает, и должен уметь
   * поправить руками. Без этого он доверяет расстановке только тогда, когда
   * она совпала с его планом.
   */
  onMoveAppliance?: (appliance: ApplianceKind, centerMm: number) => void;
  /**
   * Варианты для выбранного места и цена относительно текущего.
   *
   * Считает их рабочее место: там есть и ставки каталога, и смета.
   * Чертёж только показывает — и показывает ровно там, где стоит палец.
   */
  variants?: VariantOption[];
  onVariant?: (kind: ModuleVariantKind) => void;
  /**
   * Макет для галереи решений: тот же чертёж, только маленький.
   *
   * Без размерных цепочек, высотных отметок и подписей — только контуры
   * модулей и их начинка. Отдельной «картинки решения» не существует
   * НАМЕРЕННО: нарисованный макет разошёлся бы с настоящим чертежом
   * на первой же правке раскладки, а новое решение требовало бы работы
   * художника.
   */
  compact?: boolean;
};

export type VariantOption = {
  kind: ModuleVariantKind;
  title: string;
  hint: string;
  /** Разница в цене относительно текущего варианта, ₸. */
  deltaKzt: number;
  active: boolean;
};

/** Шаг привязки при переносе: мебель делают с точностью до полсантиметра. */
const MOVE_STEP_MM = 50;

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
  microwave: 'МК',
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
  onMoveAppliance,
  variants = [],
  onVariant,
  compact = false,
}: Props) {
  const changed = useMemo(() => new Set(changedIds), [changedIds]);

  /*
   * Перетаскивание прибора. Правила те же, что у шторки сравнения и полок:
   * `pointermove` живёт только между `pointerdown` и `pointerup`, позиция
   * пишется прямо в DOM, а `setState` — ровно один, на отпускании. Ряд
   * пересобирается тоже один раз: пересборка на каждом кадре означала бы
   * пересчёт сметы шестьдесят раз в секунду.
   */
  const ghost = useRef<SVGGElement>(null);
  const ghostRect = useRef<SVGRectElement>(null);
  const ghostLabel = useRef<SVGTextElement>(null);
  const moveCleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => moveCleanup.current?.(), []);

  const ceiling = run.ceilingHeightMm;
  // Масштаб подбирается так, чтобы ряд любой длины уместился по ширине листа.
  const drawWidth = 640;
  // В макете поля под высотные отметки и цепочку не нужны вовсе.
  const padLeft = compact ? 6 : PADDING_LEFT;
  const chainHeight = compact ? 6 : CHAIN_HEIGHT;
  const scale = drawWidth / Math.max(run.lengthMm, 1);
  const heightScale = scale;

  const svgHeight = PADDING_TOP + ceiling * heightScale + chainHeight + 16;
  const svgWidth = padLeft + drawWidth + (compact ? 6 : PADDING_RIGHT);

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

  /** Перенос прибора: подсветка будущего места и расстояние от левого угла. */
  const startMove = (event: React.PointerEvent, unit: Module) => {
    if (!onMoveAppliance || !unit.appliance) return;
    event.stopPropagation();

    const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
    if (!svg) return;

    const box = svg.getBoundingClientRect();
    const viewW = svg.viewBox.baseVal.width || box.width;
    const toMm = (clientX: number) => {
      const localX = ((clientX - box.left) / box.width) * viewW;
      return Math.round((localX - padLeft) / scale);
    };

    const half = unit.widthMm / 2;
    const grabOffset = toMm(event.clientX) - (unit.offsetMm + half);

    const snap = (mm: number) => {
      const clamped = Math.min(Math.max(mm, half), Math.max(half, run.lengthMm - half));
      return Math.round(clamped / MOVE_STEP_MM) * MOVE_STEP_MM;
    };

    let last = snap(unit.offsetMm + half);
    let frame: number | null = null;

    const paint = (centerMm: number) => {
      const rect = ghostRect.current;
      const label = ghostLabel.current;
      if (ghost.current) ghost.current.style.display = '';
      if (rect) rect.setAttribute('x', String(padLeft + (centerMm - half) * scale));
      if (label) {
        label.setAttribute('x', String(padLeft + centerMm * scale));
        label.textContent = `${Math.round(centerMm - half)} мм от угла`;
      }
    };

    const onMove = (e: PointerEvent) => {
      const mm = snap(toMm(e.clientX) - grabOffset);
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        last = mm;
        paint(mm);
      });
    };

    const onEnd = () => {
      moveCleanup.current?.();
      onMoveAppliance(unit.appliance as ApplianceKind, last);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    moveCleanup.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      if (frame !== null) cancelAnimationFrame(frame);
      if (ghost.current) ghost.current.style.display = 'none';
      moveCleanup.current = null;
    };

    paint(last);
  };

  const renderModule = (unit: Module, isUpper: boolean) => {
    const x = padLeft + unit.offsetMm * scale;
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
    /*
     * У колонны приборов два, и один кружок посреди пенала соврал бы: цех
     * должен видеть, где какая ниша и какой она высоты.
     */
    const niches = unit.column ? columnNiches(unit, moduleCarcassHeightMm(unit, run)) : [];
    const mark = unit.appliance && niches.length === 0 ? APPLIANCE_MARK[unit.appliance] : null;
    const isDisplay = unit.section === 'glass_display';

    /*
     * Вытяжка не перетаскивается: она обязана висеть над варочной и едет
     * за ней сама. Отдельная вытяжка — это ошибка монтажа, а не свобода.
     */
    const movable = Boolean(onMoveAppliance && unit.appliance && unit.appliance !== 'hood');

    return (
      <g
        key={`${isUpper ? 'u' : 'b'}-${unit.id}`}
        onClick={onSelect ? () => onSelect(unit.id) : undefined}
        onPointerDown={movable ? (event) => startMove(event, unit) : undefined}
        style={{ cursor: movable ? 'ew-resize' : onSelect ? 'pointer' : 'default' }}
      >
        {movable && <title>Тяните, чтобы перенести</title>}

        {/*
          * Прозрачная зона захвата. Контур модуля нарисован `fill="none"`,
          * а такая фигура ловит указатель только по линии обводки: тянуть
          * прибор было бы можно лишь за миллиметровую рамку.
          */}
        {movable && (
          <rect
            x={x}
            y={yTop}
            width={w}
            height={h}
            fill="transparent"
          />
        )}
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

        {/*
          * КОЛОННА: два прямоугольника ниш с метками и высотами. Высоты
          * берутся из `columnNiches` — той же функции, по которой строится
          * 3D и наполнение.
          */}
        {niches.map((niche) => {
          const nicheTop = yOf(bottom + niche.toMm);
          const nicheH = (niche.toMm - niche.fromMm) * heightScale;
          const label = APPLIANCE_MARK[niche.appliance] ?? '';

          return (
            <g key={niche.appliance}>
              <rect
                x={x + 2}
                y={nicheTop}
                width={w - 4}
                height={nicheH}
                fill="none"
                stroke="var(--blueprint)"
                strokeWidth={0.6}
              />
              <text
                x={x + w / 2}
                y={nicheTop + nicheH / 2 + 3}
                textAnchor="middle"
                fontSize={8}
                fill="var(--blueprint)"
              >
                {label}
              </text>
              {/* Высота ниши: по ней прибор либо встанет, либо нет. */}
              <text
                className="mw-num"
                x={x + w - 4}
                y={nicheTop + nicheH - 3}
                textAnchor="end"
                fontSize={6}
                fill="var(--graphite-mw)"
              >
                {niche.toMm - niche.fromMm}
              </text>
            </g>
          );
        })}

        {/*
          * ВИТРИНА: стекло в раме. Двойной контур — отраслевое обозначение
          * остеклённой дверцы, подписи хватает одной.
          */}
        {isDisplay && mode === 'fronts' && (
          <>
            <rect
              x={x + 3}
              y={yTop + 3}
              width={Math.max(0, w - 6)}
              height={Math.max(0, h - 6)}
              fill="none"
              stroke="var(--blueprint)"
              strokeWidth={0.4}
            />
            <text
              x={x + w / 2}
              y={yTop + h / 2}
              textAnchor="middle"
              fontSize={7}
              fill="var(--blueprint)"
            >
              стекло
            </text>
          </>
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

  /*
   * Меню вариантов. Позиция считается от того же viewBox, что и чертёж,
   * в процентах — svg тянется по ширине контейнера, и абсолютные пиксели
   * разъехались бы на первом же изменении окна.
   */
  const selected = allModulesOf(run).find((unit) => unit.id === selectedModuleId) ?? null;
  const menuLeft = selected
    ? ((padLeft + (selected.offsetMm + selected.widthMm / 2) * scale) / svgWidth) * 100
    : 0;

  /*
   * Макет обрезается по мебели: пустая стена до потолка занимает половину
   * карточки и ничего не сообщает. Кадрируем viewBox, а не масштаб —
   * геометрия остаётся той же, что в полном чертеже.
   */
  const topMm = compact
    ? Math.max(
        BASE_TOTAL_H,
        run.options.hasUpper ? upperTop : 0,
        ...allModulesOf(run).map((unit) =>
          unit.kind === 'tall' ? moduleHeightMm('tall') : 0,
        ),
      )
    : ceiling;

  const viewTop = compact ? yOf(topMm) - 6 : 0;
  const viewHeight = compact ? yOf(0) - yOf(topMm) + 12 : svgHeight;

  const drawing = (
    <svg
      viewBox={`0 ${viewTop} ${svgWidth} ${viewHeight}`}
      width="100%"
      role="img"
      aria-label={`Фасадный чертёж ряда ${run.lengthMm} мм`}
    >
      {/* Контур помещения: пол и потолок */}
      <line
        x1={padLeft - (compact ? 0 : 12)}
        y1={yOf(0)}
        x2={padLeft + drawWidth + (compact ? 0 : 8)}
        y2={yOf(0)}
        stroke="var(--ink)"
        strokeWidth={1.2}
      />
      <line
        x1={padLeft - (compact ? 0 : 12)}
        y1={yOf(ceiling)}
        x2={padLeft + drawWidth + (compact ? 0 : 8)}
        y2={yOf(ceiling)}
        stroke="var(--ink)"
        strokeWidth={0.6}
        strokeDasharray="4 3"
      />

      {/* Высотные отметки слева. В макете их нет: он читается силуэтом. */}
      {!compact && marks.map(([mm, label]) => (
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

      {/*
        * Подсветка будущего места прибора. Живёт над рядом и показывается
        * только во время переноса: замерщик должен видеть, куда прибор
        * встанет, ДО того как отпустит.
        */}
      {/* Подсветка переноса: в макете галереи её нет — там ничего не тянут. */}
      <g
        ref={ghost}
        style={{ display: 'none' }}
        pointerEvents="none"
        visibility={compact ? 'hidden' : undefined}
      >
        <rect
          ref={ghostRect}
          x={PADDING_LEFT}
          y={yOf(BASE_TOTAL_H)}
          width={600 * scale}
          height={yOf(0) - yOf(BASE_TOTAL_H)}
          fill="var(--tape)"
          fillOpacity={0.22}
          stroke="var(--tape)"
          strokeWidth={1}
        />
        <text
          ref={ghostLabel}
          className="mw-num"
          x={PADDING_LEFT}
          y={yOf(BASE_TOTAL_H) - 6}
          textAnchor="middle"
          fontSize={9}
          fill="var(--tape)"
        >
          0 мм от угла
        </text>
      </g>

      {run.modules.map((m) => renderModule(m, false))}
      {run.upperSegments.flatMap((segment) =>
        segment.modules.map((m) =>
          renderModule({ ...m, offsetMm: m.offsetMm }, true),
        ),
      )}

      {/* Размерная цепочка — та же, что под лентой модулей и на плане */}
      {!compact && (
      <g transform={`translate(${padLeft}, ${PADDING_TOP + ceiling * heightScale + 8})`}>
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
      )}
    </svg>
  );

  /*
   * Без вариантов — просто чертёж, без лишней обёртки: он печатается,
   * и лишний div в листе А4 ни к чему.
   */
  if (variants.length === 0 || !onVariant) return drawing;

  return (
    <div className="relative">
      {drawing}

      {/*
        * ВЫБОР ТАМ, ГДЕ СТОИТ ПАЛЕЦ. Выпадающий список в стороне заставил бы
        * замерщика переводить взгляд с чертежа на панель и обратно — а он
        * показывает этот экран клиенту.
        */}
      <div
        className="absolute z-10 w-[240px] -translate-x-1/2 print:hidden"
        style={{ left: `${menuLeft}%`, top: '4%' }}
      >
        <div className="mw-panel-flat bg-sheet shadow-[0_1px_2px_rgba(0,0,0,.28)]">
          <p className="mw-label mb-1">Что здесь стоит</p>
          <div className="grid gap-1">
            {variants.map((option) => (
              <button
                key={option.kind}
                type="button"
                onClick={() => onVariant(option.kind)}
                aria-pressed={option.active}
                className={`mw-btn w-full justify-start text-left ${
                  option.active ? 'mw-btn-primary' : 'mw-btn-ghost'
                }`}
              >
                <span className="block">
                  {option.title}
                  {/*
                    * Разница в цене, а не сумма: клиент на встрече решает
                    * «стоит ли эта дверца лишних восемнадцати тысяч»,
                    * а не сравнивает два шестизначных числа.
                    */}
                  {!option.active && option.deltaKzt !== 0 && (
                    <span className="mw-num ml-1 text-graphiteMw">
                      {option.deltaKzt > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(option.deltaKzt))} ₸
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-graphiteMw">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Все модули ряда: выбранный может быть и в верхнем. */
function allModulesOf(run: Run): Module[] {
  return [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)];
}

export { APPLIANCE_SLOTS };
