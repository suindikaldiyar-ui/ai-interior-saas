'use client';

import { useEffect, useMemo, useRef } from 'react';
import DimensionChain from './DimensionChain';
import LeaderLines from './LeaderLines';
import FrontGlyph from './FrontGlyph';
import { TipOnMark } from './DrawingSymbols';
import type { LeaderAnchor } from '@/lib/millwork/leaders';
import { APPLIANCE_SLOTS, GEOMETRY } from '@/lib/millwork/modules';
import {
  countertopMm,
  plinthMm,
  upperBottomMm,
  workTopMm,
} from '@/lib/millwork/shop';
import { sectionSpec } from '@/lib/millwork/sections';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { moveConflict } from '@/lib/millwork/freeRun';
import { reorderTarget, rowOfModule, type RunRow } from '@/lib/millwork/selection';
import type { LibraryGap } from '@/lib/millwork/moduleLibrary';
import { currentVariant } from '@/lib/millwork/moduleVariants';
import { moduleSwatch } from '@/lib/millwork/frontSwatch';
import { frontOf } from '@/lib/millwork/frontMaterial';
import { hasFacade } from '@/lib/millwork/applianceFront';
import { beamDropMm } from '@/lib/millwork/ceiling';
import { OPENING_TITLE } from '@/lib/millwork/opening';
import FrontSwatchDefs, { swatchId } from './FrontSwatchDefs';
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
import SheetDefs from './SheetDefs';
import { PositionMark } from './SectionDrawing';
import { moduleNumbers, POSITION_CIRCLE_MM } from '@/lib/millwork/positions';
import { LINE_MM, PAPER_FILL, hatchId, lineWidths, unitsPerPaperMm } from '@/lib/millwork/sheetStyle';
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
  /**
   * ПУСТОЕ МЕСТО В РЯДУ — ТОЖЕ МЕСТО.
   *
   * Свободная сборка начинается с пустой стены, и нажимать там не на
   * что: модулей нет вовсе. Промежуток между модулями — тот же случай:
   * человек видит дырку и хочет поставить туда шкаф, а нажать может
   * только по соседям.
   *
   * Пустоты приходят ГОТОВЫМИ (`libraryGaps`). Чертёж сам их не ищет: у
   * него нет ни окон, ни требований ряда, и своя догадка «между
   * модулями пусто» назвала пустым местом окно.
   */
  gaps?: LibraryGap[];
  onSelectGap?: (gap: LibraryGap) => void;
  /** Какое пустое место выбрано: подсвечивается так же, как модуль. */
  selectedGap?: { fromMm: number; row: RunRow } | null;
  /** Идентификаторы модулей, ширина которых только что изменилась. */
  changedIds?: string[];
  mode?: DrawingMode;
  /** Правка наполнения перетаскиванием. Без неё вид «внутри» только читается. */
  onFillChange?: (moduleId: string, fill: ModuleFill) => void;
  /**
   * Правку не приняли — и вот почему.
   *
   * Отдельный канал от `onFillChange`: отказ не меняет наполнение, поэтому
   * сообщить о нём тем же вызовом нечем. Молчать нельзя — замерщик тянет
   * полку, ничего не происходит, и инструмент выглядит сломанным.
   */
  onFillReject?: (reason: string) => void;
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
   * Перенос ЛЮБОГО модуля вдоль ряда — свободная сборка.
   *
   * В раскладке по шаблону двигают только приборы: остальное считает
   * `buildRun`, и подвинутая дверца всё равно вернулась бы на своё место
   * при ближайшем пересчёте. В свободной сборке место модуля — это то,
   * что человек задал руками, и двигается всё.
   */
  onMoveModule?: (moduleId: string, offsetMm: number) => void;
  /**
   * ЧТО ОЗНАЧАЕТ ЖЕСТ ПЕРЕНОСА.
   *
   * `place` — свободная сборка: модуль встаёт туда, где отпустили, и
   * соседи не двигаются. `reorder` — раскладка по шаблону и верхние
   * ряды: ряд сходится со стеной сам, и жест меняет ПОРЯДОК.
   *
   * Подсветка под пальцем считает то же и той же функцией, что запишет
   * операция: показать одно, а записать другое — хуже, чем не
   * показывать вовсе.
   */
  moveMode?: 'place' | 'reorder';
  /**
   * ШИРИНА ТЯНЕТСЯ ЗА ГРАНИЦУ МЕЖДУ МОДУЛЯМИ.
   *
   * Тот же обработчик, что и в сцене (`onWidth` у `ModuleHandles`), и
   * та же операция `set_width`: помещаемость считает движок по режиму
   * ряда, а не жест.
   */
  onWidth?: (moduleId: string, widthMm: number) => void;
  /**
   * Показывать МАТЕРИАЛ фасада, а не только его контур.
   *
   * Это режим рабочего экрана, а не листа: на бумаге заливка идёт по типу
   * элемента и печатается чёрно-белой (слой 26), а клиент на встрече
   * должен видеть, что перед ним дуб, а не абстрактная панель.
   */
  showMaterial?: boolean;
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
  /**
   * Выноски с материалами. Пусто — чертёж прежний: на экране они лишние,
   * а на листе без них нельзя заказать материал.
   */
  leaders?: LeaderAnchor[];
  /**
   * Ширина вида на бумаге, миллиметры. Из неё считаются толщины линий.
   *
   * Без неё вид остаётся прежним: экранный чертёж и оверлей над сценой
   * бумагой не являются, и подгонять их под миллиметры незачем.
   */
  paperWidthMm?: number;
  /** Номера позиций модулей: те же, что в разрезе и в детализировке. */
  positions?: Map<string, number>;
  /**
   * Слой поверх сцены.
   *
   * Тот же чертёж, но лёгкий: контуры модулей приглушены, а контур
   * помещения не рисуется вовсе — пол и потолок в кадре уже есть,
   * и вторая линия поверх первой читается как расфокус.
   */
  overlay?: boolean;
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

/**
 * Сколько пикселей считается дрожанием руки, а не переносом.
 *
 * Ниже этого порога отпускание — это выбор модуля. Планшет и палец дают
 * разброс в несколько пикселей на каждом касании, и без порога любое
 * нажатие на технику переставляло бы ряд.
 */
const MOVE_SLOP_PX = 6;

/**
 * Полоса захвата границы между модулями, в единицах чертежа.
 *
 * Линия шва нарисована в один пиксель, и попасть в неё пальцем нельзя
 * (ловушка 89: зона касания меряется тем, что видит палец, а не тем,
 * что нарисовано).
 */
const EDGE_GRAB_UNITS = 12;

/**
 * Поле под выноски с каждой стороны.
 *
 * Полки живут ВНЕ рисунка: заведи их внутрь — они лягут на мебель и на
 * размерную цепочку, а выноска поверх размера читается как ошибка.
 */
export const LEADER_MARGIN_UNITS = 290;

/** Полная ширина вида в условных единицах — по ней лист считает масштаб. */
export function elevationSpanUnits(withLeaders: boolean): number {
  return 740 + (withLeaders ? LEADER_MARGIN_UNITS * 2 : 0);
}

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
 * НАПРАВЛЕНИЕ ОТКРЫВАНИЯ — ДИАГОНАЛЯМИ, КАК В ОТРАСЛИ.
 *
 * Раньше здесь стоял треугольник: понятный, но выдуманный нами. Мебельщик
 * читает лист по привычным знакам — распашной фасад показывают диагоналями,
 * сходящимися на петельной стороне. По вершине сразу видно, куда открывается
 * дверь, и объяснять ничего не нужно.
 *
 * Клик по метке по-прежнему меняет сторону: числа замерщик не вводит.
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
  // У механизма сторон нет вовсе: дуга вверх или вниз, менять нечего.
  const mechanism = hinge === 'lift' || hinge === 'flap';

  return (
    <g
      style={{ cursor: onFlip && !mechanism ? 'pointer' : 'default' }}
      onClick={
        onFlip && !mechanism
          ? (event) => {
              event.stopPropagation();
              onFlip();
            }
          : undefined
      }
    >
      {/*
        * Сами диагонали рисует `FrontGlyph` — по описанию варианта. Здесь
        * остаётся только область под клик: по двум линиям пальцем не
        * попасть, а два рисунка одного знака рано или поздно разъедутся.
        */}
      <rect x={x} y={yTop} width={width} height={height} fill="transparent" />
      <title>{OPENING_TITLE[hinge]}</title>
    </g>
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
  onFillReject,
  k = 1,
}: {
  unit: Module;
  x: number;
  width: number;
  yTop: number;
  height: number;
  heightMm: number;
  onFillChange?: (moduleId: string, fill: ModuleFill) => void;
  onFillReject?: (reason: string) => void;
  /** Множитель толщины линий: на бумаге они абсолютные, на экране прежние. */
  k?: number;
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
        strokeWidth={0.4 * k}
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
            const edit = addShelf(fill, mm, heightMm);
            if (edit.rejected) onFillReject?.(edit.rejected);
            else onFillChange?.(unit.id, edit.fill);
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
            strokeWidth={1.2 * k}
            style={{ cursor: editable ? 'ns-resize' : 'default' }}
            onPointerDown={
              editable
                ? (event) => {
                    const line = event.currentTarget as SVGLineElement;
                    const label = line.parentElement?.querySelector('text');
                    /** Нарисовать полку на этой высоте, минуя React. */
                    const paint = (value: number) => {
                      line.setAttribute('y1', String(yAt(value)));
                      line.setAttribute('y2', String(yAt(value)));
                      if (label) {
                        label.setAttribute('y', String(yAt(value) - 3));
                        label.textContent = String(value);
                      }
                    };

                    startDrag(
                      event,
                      (value) => paint(snapTo32(value)),
                      (value) => {
                        /*
                         * СНАЧАЛА ВЕРНУЛИ КАК БЫЛО, ПОТОМ ПРИМЕНЯЕМ.
                         *
                         * Во время жеста линия ездит мимо React: его дерево
                         * всё ещё держит исходную высоту. Отклонённая правка
                         * менять пропы не будет, React ничего не тронет — и
                         * линия останется там, куда её дотянули, показывая
                         * положение, которого в данных нет. Это ложь чертежа,
                         * и лечится она возвратом, а не перерисовкой сверху.
                         *
                         * На принятой правке возврат ничего не стоит: React
                         * тут же перепишет высоту на новую, и его дерево
                         * совпадает с тем, что в DOM.
                         */
                        paint(mm);

                        const edit = moveShelf(fill, i, value, heightMm);
                        if (edit.rejected) onFillReject?.(edit.rejected);
                        else onFillChange?.(unit.id, edit.fill);
                      },
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
          strokeWidth={1.2 * k}
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
            strokeWidth={0.8 * k}
            strokeDasharray="6 3"
          />
          <circle
            cx={inner.x + inner.width / 2}
            cy={yAt(mm)}
            r={3}
            fill="none"
            stroke="var(--blueprint)"
            strokeWidth={0.8 * k}
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
                strokeWidth={0.6 * k}
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
                  strokeWidth={6 * k}
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
  gaps = [],
  onSelectGap,
  selectedGap = null,
  changedIds = [],
  mode = 'fronts',
  onFillChange,
  onFillReject,
  onMoveAppliance,
  onMoveModule,
  onWidth,
  moveMode = 'place',
  showMaterial = false,
  variants = [],
  onVariant,
  compact = false,
  overlay = false,
  leaders = [],
  paperWidthMm,
  positions,
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
  /** Снятие слушателей жеста границы: живут только между нажатием и отпусканием. */
  const edgeCleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => moveCleanup.current?.(), []);
  useEffect(() => () => edgeCleanup.current?.(), []);

  /*
   * Рабочая поверхность — ФОРМУЛА цеха, а не константа: цоколь плюс
   * боковина плюс столешница. Прежняя `BASE_TOTAL_H` была той же
   * суммой, только слагаемые принадлежали коду.
   */
  const workTop = workTopMm(run.production);
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

  const upperBottom = upperBottomMm(run.production);
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
        [plinthMm(run.production), 'цоколь'],
        ...(zone.hasCountertop ? ([[zoneTop, 'столешница']] as [number, string][]) : []),
        ...(zone.hasCountertop ? [] : ([[zoneTop, 'верх ряда']] as [number, string][])),
        [ceiling, 'потолок'],
      ]
    : [
        [0, 'пол'],
        [plinthMm(run.production), 'цоколь'],
        [workTop, 'столешница'],
        ...(run.options.hasUpper
          ? ([
              [upperBottom, 'низ верхних'],
              [upperTop, 'верх верхних'],
            ] as [number, string][])
          : []),
        [ceiling, 'потолок'],
      ];

  /**
   * ГДЕ СТОИТ КАЖДЫЙ МОДУЛЬ — ТА ЖЕ ФУНКЦИЯ, ЧТО У СЦЕНЫ.
   *
   * Отметки верхнего ряда чертёж считал своими двумя числами
   * (`upperBottom`/`upperTop`), одинаковыми для всего ряда. Пока верхний
   * ряд был один, они совпадали с раскладкой; на антресоли разошлись:
   * она стоит на крыше колонны холодильника, а чертёж рисовал её на
   * отметке навески — на 950 мм ниже, ВНУТРИ колонны. Со стороны это и
   * читается как «антресоли на чертеже нет».
   *
   * `runPlaces` отвечает на этот вопрос один раз на продукт: по ней
   * стоит сцена, по ней идут рёбра, по ней теперь и лист.
   */
  const placeOf = useMemo(() => {
    const map = new Map<string, { bottomMm: number; topMm: number }>();
    for (const place of runPlaces(run)) {
      map.set(place.unit.id, {
        bottomMm: Math.round(place.y * 1000),
        topMm: Math.round((place.y + place.heightM) * 1000),
      });
    }
    return map;
  }, [run]);

  /**
   * ПУСТЫЕ МЕСТА РЯДА, УЖЕ С ВЫСОТАМИ.
   *
   * Где пусто, решила библиотека; здесь только ВЫСОТА полосы — это
   * рисунок, а не раскладка. Её задаёт сосед по ряду: у верхнего ряда
   * отметку навески знает `runPlaces`, у антресоли она своя. Пустой
   * стене сосед не нужен — там ряд один, нижний.
   */
  const gapTargets = useMemo(() => {
    if (!onSelectGap || compact) return [];

    return gaps.map((gap) => {
      const sample =
        gap.row === 'base'
          ? undefined
          : run.upperSegments
              .flatMap((segment) => segment.modules)
              .find((unit) => rowOfModule(run, unit.id)?.row === gap.row);
      const place = sample ? placeOf.get(sample.id) : undefined;

      return {
        ...gap,
        topMm: place ? place.topMm : workTop,
        bottomMm: place ? place.bottomMm : 0,
      };
    });
  }, [gaps, run, onSelectGap, compact, placeOf, workTop]);

  /** Верх и низ модуля секционной зоны: у каждой секции своя высота. */
  const sectionBounds = (unit: Module, isUpper: boolean): { top: number; bottom: number } => {
    const spec = unit.section ? sectionSpec(unit.section) : null;

    // Антресоль и подвесные модули висят, остальное стоит на цоколе.
    if (isUpper || spec?.moduleKind === 'upper') {
      const height = spec?.heightMm || GEOMETRY.upper.carcassH;
      return { top: zoneTop, bottom: Math.max(0, zoneTop - height) };
    }

    if (spec && spec.heightMm > 0 && spec.moduleKind === 'base') {
      return { top: spec.heightMm, bottom: plinthMm(run.production) };
    }

    return { top: zoneTop, bottom: plinthMm(run.production) };
  };

  /**
   * ГРАНИЦА МЕЖДУ ДВУМЯ МОДУЛЯМИ ТЯНЕТСЯ.
   *
   * Жест меняет ширину ЛЕВОГО из двух: правый едет за ним, и ряд
   * пересобирает движок. Шаг тот же, что у ручки в сцене (50 мм):
   * пальцем миллиметр не поставить, а цех считает пятёрками.
   *
   * Ряд у границы один — тот, в котором стоят оба модуля. Соседей
   * ищет `rowOfModule`, та же функция, что выбирает ряд переносу:
   * второго ответа на «в каком ряду этот модуль» в продукте нет.
   */
  const startEdge = (event: React.PointerEvent, unit: Module) => {
    if (!onWidth) return;
    event.stopPropagation();

    const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
    if (!svg) return;

    const box = svg.getBoundingClientRect();
    const viewW = svg.viewBox.baseVal.width || box.width;
    const toMm = (clientX: number) =>
      Math.round((((clientX - box.left) / box.width) * viewW - padLeft) / scale);

    const startX = event.clientX;
    const startMm = toMm(event.clientX);
    let wanted = unit.widthMm;
    let dragged = false;
    let frame: number | null = null;

    const paint = () => {
      const rect = ghostRect.current;
      const label = ghostLabel.current;
      if (ghost.current) ghost.current.style.display = '';
      if (rect) {
        rect.setAttribute('x', String(padLeft + unit.offsetMm * scale));
        rect.setAttribute('width', String(Math.max(0, wanted * scale)));
        rect.setAttribute('fill', 'var(--tape)');
        rect.setAttribute('stroke', 'var(--tape)');
      }
      if (label) {
        label.setAttribute('x', String(padLeft + (unit.offsetMm + wanted / 2) * scale));
        label.setAttribute('fill', 'var(--tape)');
        label.textContent = `${wanted} мм`;
      }
    };

    const onMove = (e: PointerEvent) => {
      if (Math.abs(e.clientX - startX) > MOVE_SLOP_PX) dragged = true;
      const next = unit.widthMm + (toMm(e.clientX) - startMm);
      const snapped = Math.round(next / MOVE_STEP_MM) * MOVE_STEP_MM;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        wanted = Math.max(MOVE_STEP_MM, snapped);
        paint();
      });
    };

    const onEnd = () => {
      edgeCleanup.current?.();
      /* Нажатие — это ВЫБОР, а не правка: порог тот же, что у переноса. */
      if (!dragged || wanted === unit.widthMm) return;
      onWidth(unit.id, wanted);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    edgeCleanup.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      if (frame !== null) cancelAnimationFrame(frame);
      if (ghost.current) ghost.current.style.display = 'none';
      edgeCleanup.current = null;
    };

    paint();
  };

  /**
   * ГДЕ ПРОХОДЯТ ГРАНИЦЫ МЕЖДУ МОДУЛЯМИ — ВО ВСЕХ ТРЁХ РЯДАХ.
   *
   * Граница есть там, где ДВА СОСЕДА ПО ОДНОМУ РЯДУ стоят вплотную:
   * конец левого совпадает с началом правого. Разрыв ряда (окно,
   * колонна, выступ) границей не считается — там между модулями стена,
   * а не шов, и тянуть её нечего.
   *
   * Ширина техники не тянется никогда: её диктует прибор.
   */
  const edgePairs: { unit: Module; atMm: number; top: number; height: number }[] = [];
  if (onWidth && !compact) {
    const rows: Module[][] = [
      run.modules,
      ...run.upperSegments.map((segment) => segment.modules),
    ];

    for (const list of rows) {
      for (let i = 0; i < list.length - 1; i += 1) {
        const left = list[i];
        const right = list[i + 1];
        if (left.appliance || left.kind === 'filler') continue;
        const edgeMm = left.offsetMm + left.widthMm;
        if (edgeMm !== right.offsetMm) continue;

        const isUpper = list !== run.modules;
        const placed = isUpper ? placeOf.get(left.id) : undefined;
        const bounds = sectionZone
          ? sectionBounds(left, isUpper)
          : placed
            ? { top: placed.topMm, bottom: placed.bottomMm }
            : { top: isUpper ? upperTop : workTop, bottom: isUpper ? upperBottom : 0 };
        const tallTopMm =
          !sectionZone && left.kind === 'tall'
            ? plinthMm(run.production) + moduleCarcassHeightMm(left, run)
            : bounds.top;

        edgePairs.push({
          unit: left,
          atMm: edgeMm,
          top: yOf(tallTopMm),
          height: Math.max(0, yOf(bounds.bottom) - yOf(tallTopMm)),
        });
      }
    }
  }

  /** Перенос прибора: подсветка будущего места и расстояние от левого угла. */
  const startMove = (event: React.PointerEvent, unit: Module) => {
    /*
     * Свободная сборка двигает МОДУЛЬ по месту, раскладка по шаблону —
     * ПРИБОР по ручной позиции. Жест один и тот же, порог и подсветка
     * общие; разъезжаться этим двум путям нельзя, иначе на одном из них
     * снова заведётся клик, переставляющий кухню.
     */
    const byModule = Boolean(onMoveModule);
    if (!byModule && (!onMoveAppliance || !unit.appliance)) return;
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

    /*
     * ЗАНЯТОЕ МЕСТО ВИДНО ДО ОТПУСКАНИЯ.
     *
     * Соседи не раздвигаются, поэтому половина перетаскиваний упирается в
     * стоящий рядом модуль. Узнать об этом из отказа ПОСЛЕ отпускания —
     * значит тянуть наугад; подсветка меняет цвет прямо под пальцем.
     */
    /*
     * РЯД МОДУЛЯ — ОДНА ФУНКЦИЯ НА ПРОДУКТ.
     *
     * Перенос живёт ВНУТРИ ряда: модуль верхнего ряда переставляется
     * среди верхних, антресоли — среди антресоли. Спрашивать «где он
     * лежит» второй раз здесь нельзя: подсветка и операция обязаны
     * выбрать один и тот же список.
     */
    const rowHere = rowOfModule(run, unit.id);
    const rowModules = rowHere?.modules ?? run.modules;

    /*
     * Место занято — только там, где модуль встаёт НА МЕСТО. При
     * перестановке соседи расступаются сами, и «занято» там не бывает.
     */
    const reorder = moveMode === 'reorder' || (rowHere !== null && rowHere.row !== 'base');

    const busyAt = (centerMm: number) =>
      byModule && !reorder
        ? moveConflict(rowModules, unit.id, centerMm - half, run.lengthMm)
        : null;

    /*
     * КУДА ВСТАНЕТ — ТЕМ ЖЕ СЧЁТОМ, ЧТО ЗАПИШЕТ ОПЕРАЦИЯ.
     *
     * `reorderTarget` зовут оба: рабочее место, когда собирает
     * `move_module`, и эта подсветка. Своя арифметика здесь означала бы
     * число под пальцем, которого после отпускания не будет.
     */
    const landingAt = (centerMm: number) =>
      reorder
        ? (reorderTarget(rowModules, unit.id, centerMm - half)?.offsetMm ?? unit.offsetMm)
        : Math.round(centerMm - half);

    let last = snap(unit.offsetMm + half);
    let frame: number | null = null;

    /*
     * КЛИК — ЭТО ВЫБОР, А НЕ ПЕРЕНОС.
     *
     * Раньше `onEnd` применял перенос всегда, даже когда палец не сдвинулся
     * ни на пиксель: нажатие на холодильник записывало ему ручную позицию,
     * а ручная позиция раскладывается ПЕРВОЙ и переставляет остальной ряд.
     * Замерщик нажимал на модуль, чтобы его выбрать, — и кухня под ним
     * тихо перекладывалась: между мойкой и посудомойкой появлялась
     * доборная планка в 25 мм, а верхний шкаф в торце исчезал.
     *
     * Это та же ловушка, что с тапом в 3D-сцене: движение и выбор нельзя
     * различать по одному только факту отпускания.
     */
    const startX = event.clientX;
    let dragged = false;

    const paint = (centerMm: number) => {
      const rect = ghostRect.current;
      const label = ghostLabel.current;
      const busy = busyAt(centerMm);
      const paint = busy ? 'var(--alert)' : 'var(--tape)';

      if (ghost.current) ghost.current.style.display = '';
      if (rect) {
        rect.setAttribute('x', String(padLeft + (centerMm - half) * scale));
        rect.setAttribute('width', String(unit.widthMm * scale));
        rect.setAttribute('fill', paint);
        rect.setAttribute('stroke', paint);
      }
      if (label) {
        label.setAttribute('x', String(padLeft + centerMm * scale));
        label.setAttribute('fill', paint);
        /*
         * ЧТО ПОКАЖЕТ ПОДСВЕТКА — ТО И ЗАПИШЕТСЯ.
         *
         * Оба числа выставлены признаками: приёмка гоняет настоящие
         * события указателя и сверяет предпросмотр с результатом. Без
         * этого «ряд не двигается» видно только глазами, а почему —
         * не видно вовсе.
         */
        label.setAttribute('data-centre-mm', String(Math.round(centerMm)));
        label.setAttribute('data-landing-mm', String(landingAt(centerMm)));
        label.setAttribute('data-drag-row', rowHere?.row ?? 'нет');
        label.textContent = busy
          ? `занято: ${busy.blockedBy.label}`
          : `${landingAt(centerMm)} мм от угла`;
      }
    };

    const onMove = (e: PointerEvent) => {
      if (Math.abs(e.clientX - startX) > MOVE_SLOP_PX) dragged = true;
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
      // Не сдвинули — значит просто выбрали модуль. Ряд не трогаем.
      if (!dragged) return;
      if (byModule) onMoveModule?.(unit.id, last - half);
      else onMoveAppliance?.(unit.appliance as ApplianceKind, last);
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

  /*
   * Заливка материалом. У техники без фасада её нет: там нечему быть
   * дубом, и красить нишу под холодильник значит врать.
   */
  /** Филёнчатый ли фасад. Признак «есть ли фасад» — общий на продукт. */
  const framedFront = (unit: Module): boolean =>
    hasFacade(unit) && frontOf(unit).construct === 'framed';

  const materialFill = (unit: Module): string | null => {
    if (!showMaterial) return null;
    const swatch = moduleSwatch(unit);
    return swatch ? `url(#${swatchId(swatch)})` : null;
  };

  const renderModule = (unit: Module, isUpper: boolean) => {
    const x = padLeft + unit.offsetMm * scale;
    const w = unit.widthMm * scale;

    /*
     * Нижний ряд рисуется от ПОЛА до рабочей поверхности: на фасаде видны
     * цоколь и столешница, и это не раскладка модуля, а вид изделия.
     * А вот верхний ряд висит, и где именно — знает `runPlaces`.
     */
    const placed = isUpper ? placeOf.get(unit.id) : undefined;
    const bounds = sectionZone
      ? sectionBounds(unit, isUpper)
      : placed
        ? { top: placed.topMm, bottom: placed.bottomMm }
        : { top: isUpper ? upperTop : workTop, bottom: isUpper ? upperBottom : 0 };
    const top = bounds.top;
    const bottom = bounds.bottom;

    /*
     * У кухни пенал выше нижнего ряда и берёт свою стандартную высоту.
     * В секционных зонах высоту уже посчитала сама секция: штанга под
     * пальто и обувница — это разные высоты, а не «пенал».
     */
    /*
     * ВЫСОТА ПЕНАЛА — ИЗ ОБЩЕЙ ФУНКЦИИ, А НЕ СВОЯ.
     *
     * Здесь стоял вызов `standardHeightMm('tall')` БЕЗ опций ряда: чертёж
     * не знал ни про «до потолка», ни про потолок замера, и рисовал пенал
     * стандартной высоты, что бы ни считала раскладка. Вторая ветка того
     * же расчёта — ровно тот класс ошибки, что мы ловим шестой раз.
     */
    const tallTop =
      !sectionZone && unit.kind === 'tall'
        ? plinthMm(run.production) + moduleCarcassHeightMm(unit, run)
        : top;
    const yTop = yOf(tallTop);
    const h = yOf(bottom) - yTop;

    const active = selectedModuleId === unit.id;
    /*
     * У колонны приборов два, и один кружок посреди пенала соврал бы: цех
     * должен видеть, где какая ниша и какой она высоты.
     */
    const niches = unit.column ? columnNiches(unit, moduleCarcassHeightMm(unit, run), run.production) : [];
    /*
     * ВСТРОЕННЫЙ ПРИБОР — ЭТО ШКАФ, А НЕ ПРИБОРНЫЙ БЛОК.
     *
     * Холодильник за фасадом заподлицо снаружи выглядит пеналом: створка
     * того же материала, что у соседей, и та же ручка. Буква в кружке над
     * ним говорила обратное — «здесь прибор», — и клиент видел в ряду
     * серую вставку там, где стоит обычная на вид мебель.
     *
     * Отдельностоящий прибор — наоборот: он виден целиком, фасада у него
     * нет, и знак остаётся. Различие уже лежит в данных (`builtIn`), и
     * рисунок обязан его показывать.
     */
    const mark =
      unit.appliance && niches.length === 0 && unit.builtIn !== true
        ? APPLIANCE_MARK[unit.appliance]
        : null;
    const isDisplay = unit.section === 'glass_display';

    /*
     * Вытяжка не перетаскивается: она обязана висеть над варочной и едет
     * за ней сама. Отдельная вытяжка — это ошибка монтажа, а не свобода.
     */
    /*
     * ПЕРЕНОСИТСЯ МОДУЛЬ ЛЮБОГО РЯДА.
     *
     * Здесь стояло `isUpper ? false` с объяснением «верхний ряд
     * пересобирается из нижнего». Он не пересобирается с тех пор, как
     * стал держаться (`upperModules`), и `move_module` давно умеет все
     * три ряда — переставляет модуль внутри его собственного.
     *
     * Вытяжка не переносится по-прежнему: она висит над варочной и едет
     * за ней сама, отдельная вытяжка — ошибка монтажа.
     */
    const movable =
      unit.appliance === 'hood'
        ? false
        : onMoveModule
          ? true
          : Boolean(onMoveAppliance && unit.appliance);

    return (
      <g
        key={`${isUpper ? 'u' : 'b'}-${unit.id}`}
        /*
         * Опознавательный признак модуля на чертеже. Нужен приёмке:
         * перенос проверяется по СОСТАВУ и ПОРЯДКУ на самом листе, а не
         * по состоянию внутри React — именно так ловится расхождение
         * между тем, что посчитано, и тем, что человек видит.
         *
         * В макетах галереи его нет намеренно: там ДЕСЯТОК чертежей на
         * одном экране, и признак ловил бы модули всех решений сразу.
         */
        data-module-id={compact ? undefined : unit.id}
        data-module-offset={compact ? undefined : unit.offsetMm}
        /*
         * Ширина в МИЛЛИМЕТРАХ, а не в пикселях: приёмка сверяет состав
         * ряда числами цеха. Пиксель зависит от масштаба листа и от
         * ширины экрана — по нему «ширины те же» не докажешь.
         */
        data-module-width={compact ? undefined : unit.widthMm}
        /*
         * ЧЕМ МОДУЛЬ СТАЛ — для приёмки библиотеки: замена обязана
         * поменять начинку, не трогая место, а идентификатор при этом
         * прежний (он выводится из позиции). Сверить «тип сменился»
         * по одному id нельзя.
         */
        data-module-variant={compact ? undefined : currentVariant(unit)}
        /*
         * ОТМЕТКИ, ПО КОТОРЫМ МОДУЛЬ НАРИСОВАН — ПРИБОР, А НЕ УКРАШЕНИЕ.
         *
         * «Антресоли на чертеже не видно» проверить глазами нельзя: она
         * там есть, просто нарисована на 950 мм ниже своего места, внутри
         * колонны холодильника. Приёмка меряет ровно эти два числа и
         * сверяет их с тем, что считает `runPlaces` для сцены.
         */
        data-bottom-mm={compact ? undefined : Math.round(bottom)}
        data-top-mm={compact ? undefined : Math.round(tallTop)}
        /*
         * В КАКОМ РЯДУ МОДУЛЬ И ЧТО ЗНАЧИТ ЖЕСТ НАД НИМ.
         *
         * Жест живёт в SVG, и проверить его типами нельзя: приёмка
         * гоняет настоящие события указателя и обязана видеть, тот ли
         * ряд выбрал обработчик. Без этого «верхний ряд не двигается»
         * ловится только глазами — и ловилось именно так.
         */
        data-move-row={compact ? undefined : (rowOfModule(run, unit.id)?.row ?? 'нет')}
        data-move-mode={compact || !movable ? undefined : moveMode}
        onClick={onSelect ? () => onSelect(unit.id) : undefined}
        onPointerDown={movable ? (event) => startMove(event, unit) : undefined}
        style={{ cursor: movable ? 'ew-resize' : onSelect ? 'pointer' : 'default' }}
      >
        {movable && <title>Тяните, чтобы перенести</title>}

        {/*
          * Прозрачная зона захвата — ВСЕГДА, а не только у переносимой
          * техники. Контур модуля нарисован `fill="none"`, и такая фигура
          * ловит указатель только по линии обводки (ловушка 101): попасть
          * в модуль пальцем было можно лишь по миллиметровой рамке, и
          * лента вариантов не открывалась вовсе.
          */}
        <rect x={x} y={yTop} width={w} height={h} fill="transparent" />
        {/*
          * ЗАЛИВКА ПО ТИПУ ЭЛЕМЕНТА.
          *
          * Проволочный каркас глаз не разбирал: корпус, глухой фасад,
          * витрина и техника выглядели одинаково, и лист читался схемой.
          * Различия сделаны СВЕТЛОТОЙ и ШТРИХОВКОЙ, а не цветом: лист
          * печатают на обычном принтере в цеху.
          *
          * Контур рисуется ПОВЕРХ заливки (`paint-order`), иначе заливка
          * съедает половину его толщины и линия становится тоньше нормы.
          */}
        <rect
          data-fill
          x={x}
          y={yTop}
          width={w}
          height={h}
          fill={
            showMaterial && materialFill(unit)
              ? materialFill(unit)!
              : paper
                ? paperFill(unit, isDisplay)
                : 'none'
          }
          stroke="var(--blueprint)"
          strokeWidth={active ? 1.4 * k : 0.8 * k}
        />
        {/*
          * ФИЛЁНКА ВИДНА НА СХЕМЕ.
          *
          * В раскрое филёнчатый фасад — это ДВЕ детали, рама и вставка.
          * На схеме он до этого выглядел ровно как цельный: клиент
          * выбирал классику, а видел гладкую панель. Рисуем так же, как
          * делают: обвязка по контуру и утопленная вставка внутри.
          */}
        {showMaterial && framedFront(unit) && (
          <rect
            data-framed
            x={x + Math.min(w, h) * 0.12}
            y={yTop + Math.min(w, h) * 0.12}
            width={Math.max(0, w - Math.min(w, h) * 0.24)}
            height={Math.max(0, h - Math.min(w, h) * 0.24)}
            fill="none"
            stroke="var(--blueprint)"
            strokeWidth={0.6 * k}
            opacity={0.75}
          />
        )}
        {/* Стекло: редкая диагональная штриховка поверх белого поля. */}
        {paper > 0 && glassFront(unit, isDisplay) && (
          <rect
            x={x}
            y={yTop}
            width={w}
            height={h}
            fill={`url(#${hatchId('elevation', 'glass')})`}
            stroke="none"
          />
        )}
        {/* Выделение — тонкой подсветкой, чтобы не пачкать бумагу. */}
        {active && (
          <rect
            x={x}
            y={yTop}
            width={w}
            height={h}
            fill="var(--tape)"
            fillOpacity={paper ? 0.16 : 0.28}
            stroke="none"
          />
        )}

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
            onFillReject={onFillReject}
            k={k}
          />
        )}

        {/*
          * ФАСАД ПО ОПИСАНИЮ. Что именно видно у этого модуля — створка,
          * ящики, стекло витрины с полками и подсветкой, решётка сушилки —
          * решает `frontGlyph`, одна чистая функция на весь чертёж. Приёмка
          * сверяет по ней же, что два разных варианта не выглядят одинаково.
          */}
        <FrontGlyph
          unit={unit}
          mode={mode}
          x={x}
          y={yTop}
          width={w}
          height={h}
          lineScale={k}
        />

        {/*
          * НОМЕР ПОЗИЦИИ МОДУЛЯ. Тот же номер стоит в разрезе и в
          * детализировке — по нему цех сверяет деталь с чертежом.
          * На макете решения и в оверлее над сценой его нет: там это
          * не документ, а картинка.
          */}
        {paper > 0 && (
          <PositionMark
            n={numbers.get(unit.id) ?? 0}
            cx={x + w / 2}
            /*
             * КРУЖОК НЕ ЗАКРЫВАЕТ РИСУНОК ФАСАДА.
             *
             * В геометрическом центре он садился ровно на створку, ящики и
             * стекло — а у карго 150 мм перекрывал модуль целиком. Поэтому
             * широкий модуль получает кружок ВНИЗУ, где фасад пустой, а
             * узкий — выноской НАД модулем: внутри него места нет вовсе.
             */
            cy={
              w >= NARROW_MODULE_UNITS
                ? yTop + h - (POSITION_CIRCLE_MM / 2) * u * 1.5
                : yTop - (POSITION_CIRCLE_MM / 2) * u * 1.6
            }
            leaderTo={w >= NARROW_MODULE_UNITS ? undefined : yTop}
            u={u}
            lw={lw.inner}
          />
        )}

        {mode === 'fronts' && unit.frontType === 'door' && unit.doorCount === 2 && (
          <line
            x1={x + w / 2}
            y1={yTop}
            x2={x + w / 2}
            y2={yTop + h}
            stroke="var(--blueprint)"
            strokeWidth={0.4 * k}
          />
        )}

        {/*
          * Фасад без ручки: точка «Tip-on». Ящики, подъёмник, стекло и
          * прочее рисует `FrontGlyph` — по описанию варианта.
          */}
        {mode === 'fronts' && run.options.integratedHandles && unit.frontType === 'door' && (
          <TipOnMark x={x} y={yTop} width={w} />
        )}

        {/*
          * Направление открывания диагоналями остаётся отдельной меткой:
          * по клику она меняет сторону петель, а `FrontGlyph` — рисунок
          * без обработчиков.
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
                strokeWidth={0.6 * k}
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
              strokeWidth={0.4 * k}
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
              strokeWidth={0.8 * k}
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
        workTop,
        run.options.hasUpper ? upperTop : 0,
        ...allModulesOf(run).map((unit) =>
          // Высоту пенала считает та же функция, что и раскладка: со
          // школой цеха и опциями ряда, а не «просто пенал».
          unit.kind === 'tall' ? moduleCarcassHeightMm(unit, run) : 0,
        ),
      )
    : ceiling;

  const viewTop = compact ? yOf(topMm) - 6 : 0;
  const viewHeight = compact ? yOf(0) - yOf(topMm) + 12 : svgHeight;

  /*
   * С выносками вид шире: слева и справа появляются поля под полки.
   * Лист знает об этом из `elevationSpanUnits` — иначе масштаб на бумаге
   * посчитается по старой ширине и разойдётся с подписью.
   */
  const withLeaders = !compact && !overlay && leaders.length > 0;
  const viewLeft = withLeaders ? -LEADER_MARGIN_UNITS : 0;
  const viewWidth = svgWidth + (withLeaders ? LEADER_MARGIN_UNITS * 2 : 0);

  /*
   * ТОЛЩИНЫ ЛИНИЙ В МИЛЛИМЕТРАХ БУМАГИ.
   *
   * `k` — множитель, привязанный к основной линии: старые толщины держали
   * верную ОТНОСИТЕЛЬНУЮ иерархию (шов тоньше створки, створка тоньше
   * контура), но были константами в единицах вида — то есть на бумаге
   * менялись вместе с масштабом. Привязываем контур модуля к 0.5 мм и
   * тянем остальное за ним: иерархия сохраняется, толщина становится
   * настоящей.
   *
   * Нет ширины бумаги — вид рисуется на экране или лежит поверх сцены,
   * и `k = 1` оставляет его ровно таким, каким он был.
   */
  const paper = paperWidthMm && !compact && !overlay ? paperWidthMm : 0;
  const u = paper ? unitsPerPaperMm(viewWidth, paper) : 0;
  const lw = lineWidths(u || 1);
  const k = paper ? (LINE_MM.contour * u) / 0.8 : 1;
  const numbers = positions ?? moduleNumbers(run);
  /** Модуль уже 250 мм — номер уходит на выноску над ним. */
  const NARROW_MODULE_UNITS = narrowThreshold(run.lengthMm, drawWidth);

  const drawing = (
    <svg
      viewBox={`${viewLeft} ${viewTop} ${viewWidth} ${viewHeight}`}
      width="100%"
      role="img"
      aria-label={`Фасадный чертёж ряда ${run.lengthMm} мм`}
    >
      {/*
        * РИСУНКИ МАТЕРИАЛОВ — ВНЕ БУМАЖНОГО РЕЖИМА.
        *
        * Они жили под `paper > 0`, то есть только на листе, а рабочая
        * схема бумагой не является и ширины в миллиметрах не передаёт:
        * заливка ссылалась на рисунок, которого в документе нет, и фасад
        * оставался пустым контуром. По одному рисунку на МАТЕРИАЛ, а не
        * на модуль: ряд одного цвета — это одна заливка.
        */}
      {showMaterial && (
        <FrontSwatchDefs
          swatches={[...run.modules, ...run.upperSegments.flatMap((seg) => seg.modules)]
            .map((unit) => moduleSwatch(unit))
            .filter((swatch): swatch is NonNullable<typeof swatch> => Boolean(swatch))}
        />
      )}

      {paper > 0 && (
        <>
          <SheetDefs view="elevation" u={u} roles={['glass']} />
          {/* Бумага под видом: лист белый и на экране тоже. */}
          <rect
            x={viewLeft}
            y={viewTop}
            width={viewWidth}
            height={viewHeight}
            fill={PAPER_FILL.paper}
          />
        </>
      )}
      {/* Контур помещения: пол и потолок. Поверх сцены они уже есть. */}
      {!overlay && (
        <>
          <line
            x1={padLeft - (compact ? 0 : 12)}
            y1={yOf(0)}
            x2={padLeft + drawWidth + (compact ? 0 : 8)}
            y2={yOf(0)}
            stroke="var(--ink)"
            strokeWidth={1.2 * k}
          />
          <line
            x1={padLeft - (compact ? 0 : 12)}
            y1={yOf(ceiling)}
            x2={padLeft + drawWidth + (compact ? 0 : 8)}
            y2={yOf(ceiling)}
            stroke="var(--ink)"
            strokeWidth={0.6 * k}
            strokeDasharray="4 3"
          />
        </>
      )}

      {/* Высотные отметки слева. В макете их нет: он читается силуэтом. */}
      {!compact && marks.map(([mm, label]) => (
        <g key={label}>
          <line
            x1={PADDING_LEFT - 12}
            y1={yOf(mm)}
            x2={PADDING_LEFT}
            y2={yOf(mm)}
            stroke="var(--blueprint)"
            strokeWidth={0.5 * k}
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

      {/*
        * РИГЕЛЬ НА ПОТОЛКЕ.
        *
        * Цех и замерщик обязаны видеть, ПОЧЕМУ в этом месте шкаф ниже:
        * без выступа на чертеже разная высота фасадов читается ошибкой
        * построения, и первый же вопрос на приёмке — «а это что у вас
        * тут не сошлось».
        *
        * Рисуется штриховкой, а не заливкой: лист печатают чёрно-белым,
        * и сплошная плашка там схлопывается. Числа берутся из тех же
        * `run.beams`, по которым урезана высота модулей, — второй
        * источник разошёлся бы с мебелью.
        */}
      {(run.beams ?? []).length > 0 && (
        <g data-beams>
          <defs>
            <pattern
              id="mw-beam-hatch"
              width={7}
              height={7}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={7} stroke="var(--blueprint)" strokeWidth={0.8} />
            </pattern>
          </defs>

          {(run.beams ?? []).map((beam) => {
            const drop = beamDropMm(beam);
            const x = padLeft + beam.fromCornerMm * scale;
            const w = beam.widthMm * scale;
            const y = yOf(ceiling);
            const h = yOf(ceiling - drop) - y;

            return (
              <g key={beam.id} data-beam={beam.id} pointerEvents="none">
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="url(#mw-beam-hatch)"
                  stroke="var(--blueprint)"
                  strokeWidth={0.8 * k}
                />
                {!compact && h > 9 && (
                  <text
                    className="mw-num"
                    x={x + w / 2}
                    y={y + h / 2 + 3}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--ink)"
                  >
                    Ригель {drop}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* Цоколь и столешница — контуром, а не заливкой: сплошная плашка
          на печати схлопывается в чёрную полосу, а на синьке не читается.
          Поверх сцены они приглушены вместе с модулями: линия в полную
          силу поверх настоящей столешницы читается как вторая мебель. */}
      <g opacity={overlay ? 0.55 : 1}>
        <rect
          x={PADDING_LEFT}
          y={yOf(plinthMm(run.production))}
          width={drawWidth}
          height={yOf(0) - yOf(plinthMm(run.production))}
          fill="none"
          stroke="var(--blueprint)"
          strokeWidth={0.5 * k}
        />

        {/* Столешница есть не в каждой зоне: в шкафу её нет вовсе. */}
        {(!sectionZone || zone.hasCountertop) && (
          <rect
            x={PADDING_LEFT}
            y={yOf(sectionZone ? zoneTop : workTop)}
            width={drawWidth}
            height={countertopMm(run.production) * heightScale}
            fill="none"
            stroke="var(--blueprint)"
            strokeWidth={1 * k}
          />
        )}
      </g>

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
          y={yOf(workTop)}
          width={600 * scale}
          height={yOf(0) - yOf(workTop)}
          fill="var(--tape)"
          fillOpacity={0.22}
          stroke="var(--tape)"
          strokeWidth={1 * k}
        />
        <text
          ref={ghostLabel}
          className="mw-num"
          x={PADDING_LEFT}
          y={yOf(workTop) - 6}
          textAnchor="middle"
          fontSize={9}
          fill="var(--tape)"
        >
          0 мм от угла
        </text>
      </g>

      {/*
        * ПУСТЫЕ МЕСТА — ПОД МОДУЛЯМИ И ПОД ГРАНИЦАМИ.
        *
        * Промежутки с модулями не пересекаются, но нарисованные ПОСЛЕ
        * них они перехватывали бы нажатия у границ ширины, которые
        * лежат ровно на стыке (та же ловушка 85, из-за которой полка
        * переставала тянуться).
        */}
      {onSelectGap && !compact && (
        <g data-gaps={gapTargets.length}>
          {gapTargets.map((gap) => {
            const gx = padLeft + gap.fromMm * scale;
            const gw = gap.widthMm * scale;
            const gyTop = yOf(gap.topMm);
            const gh = yOf(gap.bottomMm) - gyTop;
            const chosen =
              selectedGap?.row === gap.row && selectedGap?.fromMm === gap.fromMm;

            return (
              <g
                key={`gap-${gap.row}-${gap.fromMm}`}
                data-gap-from={gap.fromMm}
                data-gap-width={gap.widthMm}
                data-gap-row={gap.row}
                onClick={() =>
                  onSelectGap({ fromMm: gap.fromMm, widthMm: gap.widthMm, row: gap.row })
                }
                style={{ cursor: 'pointer' }}
              >
                {/*
                  * ПОДСКАЗКА — ОДНОЙ СТРОКОЙ, А НЕ ТЕКСТОМ С ВСТАВКАМИ.
                  *
                  * Серверная отрисовка React выбрасывает детей `<title>`,
                  * если их больше одного: на сервере выходил пустой
                  * `<title></title>`, в браузере — с текстом, и гидратация
                  * падала целиком (ошибка #418, семь раз за загрузку).
                  */}
                <title>{`Пусто ${gap.widthMm} мм — нажмите, чтобы поставить модуль`}</title>
                <rect x={gx} y={gyTop} width={gw} height={gh} fill="transparent" />
                <rect
                  x={gx}
                  y={gyTop}
                  width={gw}
                  height={gh}
                  fill="none"
                  stroke="var(--blueprint)"
                  strokeWidth={(chosen ? 1.4 : 0.6) * k}
                  strokeDasharray={`${6 * k} ${5 * k}`}
                  opacity={chosen ? 1 : 0.45}
                />
                {gw > 40 && gh > 24 && (
                  <text
                    x={gx + gw / 2}
                    y={gyTop + gh / 2}
                    textAnchor="middle"
                    fontSize={11 * k}
                    fill="var(--blueprint)"
                    opacity={0.7}
                  >
                    {`пусто ${gap.widthMm}`}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}

      <g opacity={overlay ? 0.55 : 1}>
        {run.modules.map((m) => renderModule(m, false))}
        {run.upperSegments.flatMap((segment) =>
          segment.modules.map((m) =>
            renderModule({ ...m, offsetMm: m.offsetMm }, true),
          ),
        )}
      </g>

      {/*
        * ГРАНИЦЫ МЕЖДУ МОДУЛЯМИ — ПОВЕРХ МЕБЕЛИ И ОДНИМ СПИСКОМ.
        *
        * Рисуются ПОСЛЕ модулей: нажатие на границу обязано доставаться
        * ей, а не модулю под ней, иначе жест «потянуть ширину»
        * превращается в жест «перенести модуль». Полоса захвата — 12
        * единиц чертежа: по линии в один пиксель пальцем не попасть.
        *
        * Ряд у каждой границы свой, и берётся он из тех же списков, что
        * рисуют модули: нижний — `run.modules`, верхний и антресоль —
        * свои сегменты. Границы между РАЗНЫМИ рядами не существует.
        */}
      {onWidth && !compact && (
        <g data-edges>
          {edgePairs.map(({ unit, atMm, top, height }) => (
            <rect
              key={`edge-${unit.id}`}
              data-edge={unit.id}
              x={padLeft + atMm * scale - EDGE_GRAB_UNITS / 2}
              y={top}
              width={EDGE_GRAB_UNITS}
              height={height}
              fill="transparent"
              style={{ cursor: 'col-resize' }}
              onPointerDown={(event) => startEdge(event, unit)}
            >
              <title>Тяните, чтобы изменить ширину</title>
            </rect>
          ))}
        </g>
      )}

      {/*
        * Выноски рисуются ПОСЛЕ мебели: линия к детали должна лежать
        * поверх неё, иначе точка теряется в контуре модуля.
        */}
      {withLeaders && (
        <LeaderLines
          anchors={leaders}
          lengthMm={run.lengthMm}
          ceilingMm={ceiling}
          scale={{
            xOf: (mm) => padLeft + mm * scale,
            yOf,
            drawLeft: padLeft,
            drawRight: padLeft + drawWidth,
            /*
             * ПОЛЕ ОТДАЁТСЯ ПОДПИСЯМ ЦЕЛИКОМ.
             *
             * Урезанное на 6% поле было уже самой длинной подписи
             * («Корпус ЛДСП 16 мм, кромка ПВХ 0.4 мм» — 236 единиц при
             * поле 235), и хвост строки вылезал на чертёж, пересекая
             * излом соседней выноски. Ширина вида уже считает полное поле
             * (`elevationSpanUnits`), поэтому масштаб листа от этого не
             * едет — едет только то, что подпись помещается.
             */
            marginUnits: LEADER_MARGIN_UNITS,
            /*
             * Кегль 9: при 11 длинная подпись («Корпус ЛДСП 16 мм, кромка
             * ПВХ 0.4 мм») вылезала из поля и ложилась на высотные отметки
             * чертежа — читалось как ошибка построения.
             */
            fontSize: 9,
          }}
        />
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
/**
 * Узкий модуль: кружок позиции внутрь не помещается.
 *
 * 250 мм мебели в единицах чертежа. Ряд рисуется в поле `DRAW_FIELD.draw`
 * единиц, поэтому порог зависит от длины ряда и считается на месте.
 */
function narrowThreshold(lengthMm: number, drawWidth: number): number {
  return (250 / Math.max(1, lengthMm)) * drawWidth;
}

/**
 * Заливка модуля по типу элемента.
 *
 * Читается СВЕТЛОТОЙ, а не цветом: лист печатают чёрно-белым.
 *   техника        — серая, темнее корпуса
 *   открытая ниша  — без заливки, видно нутро
 *   стекло и фасад — белые, стекло дополнительно штрихуется
 *   всё остальное  — светло-серый корпус ЛДСП
 */
function paperFill(unit: Module, isDisplay: boolean): string {
  /*
   * Встроенный прибор закрыт фасадом — и на листе он фасад: цех клеит
   * кромку и вешает петли на створку, а не на холодильник. Виден
   * целиком только отдельностоящий, он и остаётся приборной заливкой.
   */
  if (unit.appliance && unit.builtIn === true) return PAPER_FILL.front;
  if (unit.appliance) return PAPER_FILL.appliance;
  if (unit.frontType === 'none') return PAPER_FILL.open;
  if (glassFront(unit, isDisplay)) return PAPER_FILL.glass;
  if (unit.frontType === 'door' || unit.frontType === 'drawers') return PAPER_FILL.front;
  return PAPER_FILL.carcass;
}

/** Прозрачный фасад: витрина, стекло в раме, стеклянная секция. */
function glassFront(unit: Module, isDisplay: boolean): boolean {
  if (isDisplay) return true;
  const kind = unit.variant;
  return kind === 'upper_glass' || kind === 'upper_display' || kind === 'tall_display';
}

function allModulesOf(run: Run): Module[] {
  return [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)];
}

export { APPLIANCE_SLOTS };
