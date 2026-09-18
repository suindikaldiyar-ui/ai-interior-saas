'use client';

import DimensionChain from './DimensionChain';
import { CommLegend, COMM_SYMBOL } from './DrawingSymbols';
import { GEOMETRY, isUpperRow } from '@/lib/millwork/modules';
import { moduleDepthMm } from '@/lib/millwork/fill';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { LINE_MM, unitsPerPaperMm } from '@/lib/millwork/sheetStyle';
import type { CommPoint, LayoutIssue, Run } from '@/types/millwork';

/**
 * Вид сверху: глубины, привязки к стенам, точки коммуникаций с расстоянием
 * от угла в миллиметрах и проходы.
 *
 * Красный флажок, если якорный модуль не совпал с коммуникацией. Мойка в
 * 900 мм от вывода воды — это переделка на объекте; увидеть её надо в
 * квартире, а не на монтаже.
 */

type Props = {
  run: Run;
  comms: CommPoint[];
  issues: LayoutIssue[];
  selectedModuleId?: string | null;
  onSelect?: (moduleId: string) => void;
  /** Ширина прохода перед фронтом, мм. */
  walkwayMm?: number;
  /** Ширина вида на бумаге: из неё считаются толщины линий. */
  paperWidthMm?: number;
};

const PADDING_LEFT = 74;
const PADDING_TOP = 34;
const DRAW_WIDTH = 640;

/**
 * ЗНАК КОММУНИКАЦИИ, А НЕ БУКВА.
 *
 * Буква «В» в кружке — ребус: вода, вентиляция или выключатель. Условные
 * знаки читаются мгновенно, а расшифровывает их легенда в углу листа.
 */
const COMM_MARK: Record<CommPoint['kind'], string> = {
  water_supply: COMM_SYMBOL.water_supply.mark,
  sewer: COMM_SYMBOL.sewer.mark,
  gas: COMM_SYMBOL.gas.mark,
  ventilation: COMM_SYMBOL.ventilation.mark,
  socket: COMM_SYMBOL.socket.mark,
  switch: COMM_SYMBOL.switch.mark,
  radiator: COMM_SYMBOL.radiator.mark,
};

export default function PlanDrawing({
  run,
  comms,
  issues,
  paperWidthMm,
  selectedModuleId,
  onSelect,
  walkwayMm = 1000,
}: Props) {
  const scale = DRAW_WIDTH / Math.max(run.lengthMm, 1);
  const maxDepth = GEOMETRY.base.countertopDepth;
  const depthPx = maxDepth * scale;
  const walkwayPx = Math.min(walkwayMm * scale, 90);

  /*
   * Внизу плана живёт легенда: без неё знаки коммуникаций приходится
   * угадывать, а угадывают их на объекте и не всегда верно.
   */
  const legendKinds = comms.map((c) => c.kind);
  const legendRows = legendKinds.filter((kind, i) => legendKinds.indexOf(kind) === i).length;
  const legendHeight = legendRows > 0 ? 14 + legendRows * 12 : 0;

  const svgHeight = PADDING_TOP + depthPx + walkwayPx + 78 + legendHeight;
  const svgWidth = PADDING_LEFT + DRAW_WIDTH + 26;

  /*
   * Толщины на бумаге. Множитель привязан к основной линии плана (0.8
   * единицы): относительная иерархия сохраняется, а на бумаге контур
   * становится ровно 0.5 мм при любом масштабе.
   */
  const paper = paperWidthMm ?? 0;
  const u = paper ? unitsPerPaperMm(svgWidth, paper) : 0;
  const k = paper ? (LINE_MM.contour * u) / 0.8 : 1;

  // Стена сверху, фронт снизу — как смотрит замерщик, стоя в комнате.
  const wallY = PADDING_TOP;

  const errorAt = new Map<string, LayoutIssue>();
  for (const issue of issues) {
    if (issue.level === 'error' && issue.moduleId) errorAt.set(issue.moduleId, issue);
  }

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      width="100%"
      role="img"
      aria-label="План ряда с привязками к коммуникациям"
    >
      {/* Стена */}
      <rect
        x={PADDING_LEFT - 10}
        y={wallY - 10}
        width={DRAW_WIDTH + 20}
        height={10}
        fill="var(--concrete-deep)"
        stroke="var(--ink)"
        strokeWidth={0.8 * k}
      />
      <text className="mw-label" x={PADDING_LEFT - 14} y={wallY - 14} textAnchor="start" fontSize={8}>
        стена
      </text>

      {/*
        * ВЕРХНИЙ РЯД И АНТРЕСОЛЬ — ПУНКТИРОМ НАД ПЛОСКОСТЬЮ РЕЗА.
        *
        * План секут выше столешницы и ниже навесных, поэтому всё, что
        * висит, показывают пунктиром: так его читают и в мебельном, и в
        * строительном чертеже. Здесь их не было вовсе — а антресоль
        * глубже верхнего ряда, и её вынос вперёд виден ТОЛЬКО на плане.
        *
        * Место и глубина берутся у `runPlaces` — той же функции, по
        * которой стоит сцена: своя формула здесь означала бы план, не
        * совпадающий с мебелью.
        */}
      {runPlaces(run)
        .filter((place) => isUpperRow(place.unit))
        .map((place) => {
          const x = PADDING_LEFT + place.unit.offsetMm * scale;
          const w = place.unit.widthMm * scale;
          const d = Math.round(place.depthM * 1000) * scale;

          return (
            <rect
              key={`upper-${place.unit.id}`}
              data-module-id={place.unit.id}
              /* Задняя плоскость у всех рядов одна — стена. */
              data-back-mm={0}
              data-front-mm={Math.round(place.depthM * 1000)}
              x={x}
              y={wallY}
              width={w}
              height={d}
              fill="none"
              stroke="var(--blueprint)"
              strokeWidth={0.6}
              strokeDasharray="4 3"
              opacity={0.75}
            />
          );
        })}

      {/* Модули сверху вниз: глубина от стены */}
      {run.modules.map((unit) => {
        const x = PADDING_LEFT + unit.offsetMm * scale;
        const w = unit.widthMm * scale;
        /*
         * Глубина берётся ТОЙ ЖЕ функцией, что режет раскрой: своя копия
         * по виду модуля не знала ни школы цеха, ни глубокого прибора, и
         * план показывал не ту мебель, которую пилят.
         */
        const d = moduleDepthMm(unit, run.zone, run.production) * scale;
        const active = selectedModuleId === unit.id;
        const issue = errorAt.get(unit.id);

        return (
          <g
            key={unit.id}
            data-module-id={unit.id}
            /*
             * Плоскости в миллиметрах от стены: задняя обязана быть нулём
             * у всех рядов, переднюю уводит глубина. Приёмка сверяет эти
             * числа с `runPlaces`, а не смотрит на картинку.
             */
            data-back-mm={0}
            data-front-mm={Math.round(moduleDepthMm(unit, run.zone, run.production))}
            onClick={onSelect ? () => onSelect(unit.id) : undefined}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            <rect
              x={x}
              y={wallY}
              width={w}
              height={d}
              fill={active ? 'var(--tape)' : 'var(--sheet)'}
              fillOpacity={active ? 0.3 : 1}
              stroke={issue ? 'var(--alert)' : 'var(--blueprint)'}
              strokeWidth={issue ? 1.4 : 0.8}
            />
            {unit.appliance && (
              <text
                x={x + w / 2}
                y={wallY + d / 2 + 3}
                textAnchor="middle"
                fontSize={7}
                fill="var(--blueprint)"
              >
                {unit.label}
              </text>
            )}
            {issue && (
              <>
                {/* Красный флажок ставится ровно там, где расхождение */}
                <line
                  x1={x + w / 2}
                  y1={wallY + d}
                  x2={x + w / 2}
                  y2={wallY + d + 16}
                  stroke="var(--alert)"
                  strokeWidth={1 * k}
                />
                <polygon
                  points={`${x + w / 2},${wallY + d + 16} ${x + w / 2 + 12},${wallY + d + 20} ${x + w / 2},${wallY + d + 24}`}
                  fill="var(--alert)"
                />
              </>
            )}
          </g>
        );
      })}

      {/* Столешница со свесом — пунктиром */}
      <rect
        x={PADDING_LEFT}
        y={wallY}
        width={DRAW_WIDTH}
        height={depthPx}
        fill="none"
        stroke="var(--blueprint)"
        strokeWidth={0.5 * k}
        strokeDasharray="3 2"
      />

      {/* Глубина слева */}
      <g>
        <line
          x1={PADDING_LEFT - 22}
          y1={wallY}
          x2={PADDING_LEFT - 22}
          y2={wallY + depthPx}
          stroke="var(--blueprint)"
          strokeWidth={0.8 * k}
        />
        <text
          className="mw-num"
          x={PADDING_LEFT - 26}
          y={wallY + depthPx / 2}
          textAnchor="end"
          fontSize={8}
          fill="var(--blueprint)"
        >
          {maxDepth}
        </text>
      </g>

      {/* Точки коммуникаций с расстоянием от угла */}
      {comms.map((point) => {
        const x = PADDING_LEFT + point.fromCornerMm * scale;
        return (
          <g key={point.id}>
            <line
              x1={x}
              y1={wallY - 10}
              x2={x}
              y2={wallY + depthPx + 6}
              stroke="var(--graphite-mw)"
              strokeWidth={0.4 * k}
              strokeDasharray="2 2"
            />
            <circle cx={x} cy={wallY - 5} r={6} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={0.8 * k} />
            <text x={x} y={wallY - 2.5} textAnchor="middle" fontSize={6} fill="var(--ink)">
              {COMM_MARK[point.kind]}
            </text>
            <text
              className="mw-num"
              x={x}
              y={wallY + depthPx + 16}
              textAnchor="middle"
              fontSize={7}
              fill="var(--graphite-mw)"
            >
              {point.fromCornerMm}
            </text>
          </g>
        );
      })}

      {/* Проход перед фронтом */}
      <g>
        <rect
          x={PADDING_LEFT}
          y={wallY + depthPx + 26}
          width={DRAW_WIDTH}
          height={walkwayPx}
          fill="none"
          stroke="var(--graphite-mw)"
          strokeWidth={0.4 * k}
          strokeDasharray="5 4"
        />
        <text
          className="mw-num"
          x={PADDING_LEFT + DRAW_WIDTH / 2}
          y={wallY + depthPx + 26 + walkwayPx / 2 + 3}
          textAnchor="middle"
          fontSize={8}
          fill="var(--graphite-mw)"
        >
          проход {walkwayMm}
        </text>
      </g>

      {/* Та же размерная цепочка, что под чертежом и лентой модулей */}
      <g transform={`translate(${PADDING_LEFT}, ${wallY + depthPx + 34 + walkwayPx})`}>
        <DimensionChain
          segments={run.modules.map((m) => ({
            id: m.id,
            fromMm: m.offsetMm,
            toMm: m.offsetMm + m.widthMm,
            highlighted: selectedModuleId === m.id,
          }))}
          totalMm={run.lengthMm}
          width={DRAW_WIDTH}
          scale={scale}
          onSelect={onSelect}
        />
      </g>

      {/* Легенда коммуникаций: знаки расшифровываются один раз на листе. */}
      <CommLegend
        kinds={comms.map((c) => c.kind)}
        x={PADDING_LEFT}
        y={svgHeight - legendHeight + 4}
      />
    </svg>
  );
}
