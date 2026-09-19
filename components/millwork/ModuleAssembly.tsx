'use client';

import { useMemo } from 'react';
import type { Module, Panel, Run } from '@/types/millwork';
import {
  buildAssemblySheet,
  type AssemblySheet,
  type DrawerView,
} from '@/lib/millwork/assembly';
import type { AxonFace } from '@/lib/millwork/axonometry';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';

/**
 * СБОРОЧНЫЙ ЛИСТ МОДУЛЯ.
 *
 * Деталировка была таблицей текстом: цех видел строки и не видел, где
 * боковина стоит в модуле и какой стороной. Плоский вид спереди отвечал
 * на это плохо — боковина, дно и задняя стенка ложатся друг на друга
 * прямоугольниками, а номера стоят поверх деталей и закрывают их.
 *
 * Производственный лист устроен иначе:
 *
 *   объём        видно боковину, дно, крышу, полку и заднюю стенку сразу
 *   выноски      от детали к кружку по краю листа, линии не пересекаются
 *   цепь         габарит модуля: ширина × высота × глубина
 *   ящики        каждый своим видом под модулем
 *   таблицы      что распилить и что купить
 *   штамп        чей заказ, какая позиция, какая конфигурация
 *
 * СВОИХ ЧИСЕЛ ЗДЕСЬ НЕТ ВОВСЕ: всё считает `buildAssemblySheet`, и каждая
 * величина там взята у того, кто её уже считает, — места модуля, коробок
 * сцены, раскроя, разведения выносок и расчёта фурнитуры.
 */

type Props = {
  run: Run;
  unit: Module;
  panels: Panel[];
  production?: ProductionSettings;
  /** Выбранная деталь: её номер. Подсветка общая с таблицей. */
  selectedNumber?: string | null;
  onSelect?: (number: string) => void;
  stamp?: {
    title: string;
    zone?: string;
    measuredBy?: string;
    measuredAt?: string;
  };
};

/** Бумага считается в миллиметрах модуля: масштаб — деление, не подгонка. */
const S = 1000;

/** Светлота грани: верх светлее, бок темнее — так объём читается без цвета. */
const FACE_TONE: Record<AxonFace['face'], number> = {
  top: 1,
  front: 0.86,
  side: 0.72,
};

function facePoints(face: AxonFace): string {
  return face.points.map((p) => `${p.x * S},${p.y * S}`).join(' ');
}

export default function ModuleAssembly({
  run,
  unit,
  panels,
  production = DEFAULT_PRODUCTION,
  selectedNumber,
  onSelect,
  stamp,
}: Props) {
  const sheet = useMemo(
    () => buildAssemblySheet(run, unit, panels, production),
    [run, unit, panels, production],
  );

  if (!sheet || sheet.parts.length === 0) {
    /*
     * ПУСТО — ЭТО НЕ ПУСТОЙ ЭКРАН.
     *
     * У ниши под технику корпуса нет вовсе, и молчаливый пустой
     * прямоугольник читался бы как «не загрузилось».
     */
    return (
      <p className="text-[13px] text-graphiteMw">
        У «{unit.label}» деталей корпуса нет: место занимает прибор.
      </p>
    );
  }

  const { bounds, extent } = sheet;
  const minX = bounds.minX * S;
  const minY = bounds.minY * S;
  const maxX = bounds.maxX * S;
  const maxY = bounds.maxY * S;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  /*
   * КРУЖОК НОМЕРА — ПОСТОЯННОГО РАЗМЕРА В МИЛЛИМЕТРАХ МОДЕЛИ.
   *
   * Доля габарита здесь не годится: пенал 2300 мм и тумба 720 мм
   * вписываются в блок разной высоты, и один и тот же «процент» давал в
   * пенале номер в пять пикселей, а в тумбе — в восемнадцать. Радиус в
   * миллиметрах плюс ВЫСОТА БЛОКА ОТ РАЗМЕРА ВИДА держат масштаб бумаги
   * одинаковым на любом модуле: 0.125 px на миллиметр, и кружок всегда
   * около 24 px, а цифра около 10 px.
   *
   * Кружки стоят ЗА рисунком, а не на нём: номер поверх детали закрывает
   * ровно то, ради чего лист смотрят. Поле входит в `viewBox`, поэтому
   * подпись не может уехать за обрез (ловушка 265).
   */
  const mark = 95;
  const pad = mark * 2.4;
  const dim = mark * 0.9;

  const viewX = minX - pad - mark;
  const viewY = minY - mark * 2;
  const viewW = spanX + (pad + mark) * 2;
  const viewH = spanY + mark * 4;

  /** Пикселей на миллиметр модели: один на все модули, отсюда и высота блока. */
  const PAPER = 0.125;
  const heightPx = Math.round(Math.min(470, Math.max(190, viewH * PAPER)));

  /** Высота полки на бумаге: поле выносок меряет снизу вверх. */
  const shelfY = (shelfYMm: number) => minY + (spanY - shelfYMm);

  const leaders = [
    ...sheet.leaders.left.map((l) => ({ ...l, edgeX: minX, circleX: minX - pad })),
    ...sheet.leaders.right.map((l) => ({ ...l, edgeX: maxX, circleX: maxX + pad })),
  ];

  return (
    <div data-assembly-sheet={unit.id} className="break-inside-avoid">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 text-[13px]">
        <span className="font-medium">
          {sheet.moduleNumber !== null && `${sheet.moduleNumber}. `}
          {unit.label}
        </span>
        <span className="mw-num text-graphiteMw" data-extent={`${extent.widthMm}×${extent.heightMm}×${extent.depthMm}`}>
          {extent.widthMm} × {extent.heightMm} × {extent.depthMm} мм
        </span>
      </div>

      <svg
        viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
        /*
         * ВЫСОТА ОГРАНИЧЕНА, ПРОПОРЦИИ — НЕТ.
         *
         * `h-auto` при пенале 2300 мм давал рисунок в две тысячи пикселей.
         * `meet` вписывает лист целиком и не мнёт его: сплющенный чертёж
         * читается как другая мебель.
         */
        preserveAspectRatio="xMidYMid meet"
        style={{ height: heightPx }}
        className="block w-full"
        data-module-assembly={unit.id}
      >
        {/* ── Модуль объёмом: дальние грани первыми ── */}
        {sheet.faces.map(({ part, face }, i) => {
          const active = part === selectedNumber;
          return (
            <polygon
              key={i}
              data-part={part}
              points={facePoints(face)}
              fill={active ? 'var(--accent)' : 'var(--sheet)'}
              fillOpacity={active ? 0.45 : FACE_TONE[face.face]}
              stroke={active ? 'var(--accent)' : 'var(--blueprint)'}
              strokeWidth={active ? 2 : 1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              onClick={onSelect ? () => onSelect(part) : undefined}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            />
          );
        })}

        {/* ── Выноски: линия к излому, полка, кружок с номером ── */}
        {leaders.map((leader) => {
          const active = leader.id === selectedNumber;
          const part = sheet.parts.find((p) => p.number === leader.id);
          if (!part) return null;

          const ax = part.anchor.x * S;
          const ay = part.anchor.y * S;
          const sy = shelfY(leader.shelfYMm);
          const color = active ? 'var(--accent)' : 'var(--blueprint)';

          return (
            <g
              key={leader.id}
              data-leader={leader.id}
              onClick={onSelect ? () => onSelect(leader.id) : undefined}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            >
              {/*
                * Диагональ и полка — два отрезка, а не один.
                *
                * Диагонали разводит `uncross` обменом полок, а полки лежат
                * горизонтально на разных высотах и пересечься не могут:
                * вместе это и даёт лист без единого перекрестья.
                */}
              <line
                data-leader-line={leader.id}
                x1={ax}
                y1={ay}
                x2={leader.edgeX}
                y2={sy}
                stroke={color}
                strokeWidth={active ? 2 : 1}
                vectorEffect="non-scaling-stroke"
              />
              <line
                data-leader-line={leader.id}
                x1={leader.edgeX}
                y1={sy}
                x2={leader.circleX}
                y2={sy}
                stroke={color}
                strokeWidth={active ? 2 : 1}
                vectorEffect="non-scaling-stroke"
              />
              {/* Точка на детали: в мебельных чертежах на конце точка, не стрелка */}
              <circle cx={ax} cy={ay} r={mark * 0.22} fill={color} />
              <circle
                cx={leader.circleX}
                cy={sy}
                r={mark}
                fill="var(--sheet)"
                stroke={color}
                strokeWidth={active ? 2 : 1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={leader.circleX}
                y={sy + mark * 0.32}
                textAnchor="middle"
                fontSize={mark * 0.85}
                fill={color}
              >
                {leader.id}
              </text>
            </g>
          );
        })}

        {/* ── Размерная цепь: ширина × высота × глубина ── */}
        <DimensionChain sheet={sheet} dim={dim} />
      </svg>

      {/* ── Ящики отдельными видами ── */}
      {sheet.drawers.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-graphiteMw">
            Ящики
          </div>
          <div className="flex flex-wrap items-start gap-3">
            {sheet.drawers.map((drawer) => (
              <DrawerFigure key={drawer.index} drawer={drawer} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
            {/* ── Деталировка модуля ── */}
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-graphiteMw">
                Деталировка
              </div>
              <table className="w-full text-left text-[11px]">
                <thead className="text-graphiteMw">
                  <tr className="border-b border-blueprint/40">
                    <th className="py-1 pr-2">№</th>
                    <th className="py-1 pr-2">Деталь</th>
                    <th className="py-1 pr-2">Размер, мм</th>
                    <th className="py-1 pr-2">Кол.</th>
                    <th className="py-1">Материал</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.panels.map((panel) => (
                    <tr
                      key={panel.number}
                      data-assembly-row={panel.number}
                      aria-selected={panel.number === selectedNumber}
                      onClick={onSelect ? () => onSelect(panel.number) : undefined}
                      className={`border-b border-blueprint/15 ${
                        panel.number === selectedNumber ? 'bg-[var(--accent)]/15' : ''
                      }`}
                    >
                      <td className="mw-num py-1 pr-2">{panel.number}</td>
                      <td className="py-1 pr-2">{panel.name}</td>
                      <td className="mw-num py-1 pr-2">
                        {panel.lengthMm} × {panel.widthMm}
                      </td>
                      <td className="mw-num py-1 pr-2">{panel.qty}</td>
                      <td className="py-1">{panel.material}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Фурнитура: те же числа, что в смете ── */}
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-graphiteMw">
                Фурнитура
              </div>
              {sheet.hardware.length === 0 ? (
                <p className="text-[11px] text-graphiteMw">
                  У этого модуля фурнитуры нет: ни створок, ни ящиков.
                </p>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead className="text-graphiteMw">
                    <tr className="border-b border-blueprint/40">
                      <th className="py-1 pr-2">Наименование</th>
                      <th className="py-1">Кол.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.hardware.map((row) => (
                      <tr
                        key={row.key}
                        data-hardware={row.key}
                        data-qty={row.qty}
                        className="border-b border-blueprint/15"
                      >
                        <td className="py-1 pr-2">{row.title}</td>
                        <td className="mw-num py-1">
                          {row.qty} {row.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/*
            * ЧЕГО НА ЛИСТЕ НЕТ — НАЗВАНО СЛОВАМИ.
            *
            * Молчание тут читается как «этого и не нужно». Короб ящика и
            * присадка не рассчитаны, и сборщик обязан узнать это с листа,
            * а не в цеху над распиленной плитой.
            */}
          <ul className="mt-2 grid gap-[2px] text-[10px] leading-[1.35] text-tape">
            {sheet.missing.map((line) => (
              <li key={line} data-assembly-missing>
                {line}
              </li>
            ))}
          </ul>

      {stamp && (
        <div className="mw-num mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-blueprint/40 pt-2 text-[10px] text-graphiteMw">
          <span>{stamp.title}</span>
          {stamp.zone && <span>{stamp.zone}</span>}
          <span>
            {sheet.moduleNumber !== null ? `поз. ${sheet.moduleNumber} · ` : ''}
            {unit.label}
          </span>
          <span>
            {extent.widthMm}×{extent.heightMm}×{extent.depthMm}
          </span>
          {stamp.measuredBy && <span>разраб.: {stamp.measuredBy}</span>}
          {stamp.measuredAt && <span>{stamp.measuredAt}</span>}
          <span>конфигурация {run.fingerprint}</span>
        </div>
      )}
    </div>
  );
}

/**
 * РАЗМЕРНАЯ ЦЕПЬ ГАБАРИТА.
 *
 * Три ребра модуля с числами: ширина по низу, высота по левому краю,
 * глубина назад. Числа — те же, что в `runPlaces`; пересчитывать габарит
 * по рисунку значило бы мерить проекцию вместо мебели.
 */
function DimensionChain({ sheet, dim }: { sheet: AssemblySheet; dim: number }) {
  const { extent } = sheet;
  const w = extent.widthMm / S;
  const h = extent.heightMm / S;
  const d = extent.depthMm / S;

  /* Та же проекция, что у модуля: второй изометрии на листе нет. */
  const p = (x: number, y: number, z: number) => {
    const COS30 = Math.cos(Math.PI / 6);
    const SIN30 = Math.sin(Math.PI / 6);
    return { x: (x - z) * COS30 * S, y: ((x + z) * SIN30 - y) * S };
  };

  /*
   * ЦЕПИ ОТВОДЯТСЯ ПЕРПЕНДИКУЛЯРНО СВОЕМУ РЕБРУ.
   *
   * Ширина и глубина выходят из одного угла в разные стороны, и общий
   * отвод «вниз» сажал их числа друг на друга — «600» и «560» читались
   * как одно. Ширина уходит вниз-влево, глубина вниз-вправо, высота —
   * влево: так каждое число стоит у своего ребра.
   */
  const off = dim * 1.6;

  const lines: { a: { x: number; y: number }; b: { x: number; y: number }; text: string; dx: number; dy: number }[] = [
    {
      a: p(0, 0, 0),
      b: p(w, 0, 0),
      text: String(extent.widthMm),
      dx: -off * 0.55,
      dy: off * 0.95,
    },
    {
      a: p(0, 0, 0),
      b: p(0, h, 0),
      text: String(extent.heightMm),
      dx: -off * 1.15,
      dy: 0,
    },
    {
      a: p(0, 0, 0),
      b: p(0, 0, -d),
      text: String(extent.depthMm),
      dx: off * 0.55,
      dy: off * 0.95,
    },
  ];

  return (
    <g data-dimension-chain>
      {lines.map((line, i) => (
        <g key={i}>
          <line
            x1={line.a.x + line.dx}
            y1={line.a.y + line.dy}
            x2={line.b.x + line.dx}
            y2={line.b.y + line.dy}
            stroke="var(--tape)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={(line.a.x + line.b.x) / 2 + line.dx}
            y={(line.a.y + line.b.y) / 2 + line.dy - dim * 0.25}
            textAnchor="middle"
            fontSize={dim * 0.75}
            fill="var(--tape)"
          >
            {line.text}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * Вид одного ящика.
 *
 * Показывает ровно то, что лежит в раскрое, — фронт со своим номером и
 * размером. Короба там нет, и об этом лист говорит отдельной строкой:
 * дорисованные дно и боковины были бы деталями, которых никто не резал.
 */
function DrawerFigure({ drawer }: { drawer: DrawerView }) {
  const { bounds, field } = drawer;
  /*
   * Рамка одна на все ящики модуля, а содержимое центрируется в ней:
   * так низкий фронт и остаётся низким рядом с высоким.
   */
  const cx = ((bounds.minX + bounds.maxX) / 2) * S;
  const cy = ((bounds.minY + bounds.maxY) / 2) * S;
  const fw = field.width * S * 1.16;
  const fh = field.height * S * 1.16;
  const front = drawer.panels[0] ?? null;

  return (
    <div data-drawer-view={drawer.index} className="w-[108px]">
      <svg
        viewBox={`${cx - fw / 2} ${cy - fh / 2} ${fw} ${fh}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full"
      >
        {drawer.faces.map((face, i) => (
          <polygon
            key={i}
            points={facePoints(face)}
            fill="var(--sheet)"
            fillOpacity={FACE_TONE[face.face]}
            stroke="var(--blueprint)"
            strokeWidth={1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="text-[10px] leading-tight">Ящик {drawer.index}</div>
      <div className="mw-num text-[10px] leading-tight text-graphiteMw">
        {front ? `${front.number} · ${front.lengthMm}×${front.widthMm}` : 'фронта в раскрое нет'}
      </div>
    </div>
  );
}
