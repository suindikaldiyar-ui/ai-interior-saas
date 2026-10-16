'use client';

import SheetDefs from './SheetDefs';
import {
  carcassHeightMm,
  countertopMm,
  plinthMm,
  upperBottomMm,
  workTopMm,
} from '@/lib/millwork/shop';
import { rowStandardDepthMm } from '@/lib/millwork/fill';
import { bayEnvelope, bayLayout, fillShelfCount } from '@/lib/millwork/bays';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { DRAWER_FRONT_PANEL_NAME, SHELF_PANEL_NAME, panelNumberOf } from '@/lib/millwork/panels';
import { GEOMETRY, isUpperRow } from '@/lib/millwork/modules';
import { moduleNumbers, POSITION_CIRCLE_MM } from '@/lib/millwork/positions';
import {
  PAPER_FILL,
  axisDash,
  hatchId,
  lineWidths,
  unitsPerPaperMm,
} from '@/lib/millwork/sheetStyle';
import { zoneProfile } from '@/lib/millwork/zones';
import type { Module, ModuleFill, Panel, Run } from '@/types/millwork';

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
 *
 * НАПОЛНЕНИЕ БЕРЁТСЯ ИЗ `fill` ВЫБРАННОГО МОДУЛЯ. Раньше полки рисовались
 * по долям высоты — 0.33, 0.66 и 0.5, — то есть по числам, взятым из
 * воздуха. Вид назывался «с наполнением», показывал две выдуманные линии
 * и не менялся никогда: замерщик двигал полку, а разрез оставался прежним.
 *
 * Разрез ОДИН НА РЯД, а наполнение у каждого модуля своё. Поэтому без
 * выбранного модуля полок нет вовсе, и об этом сказано словами прямо на
 * виде: пустой корпус, который молчит, читается как «полок не будет».
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
  /** Чьё наполнение показываем. Без него полки не рисуются вовсе. */
  selectedModuleId?: string | null;
  /**
   * Через какой отсек идёт разрез (R02A.1): выбранный человеком. Пусто —
   * отсек с ящиками, иначе крайний левый с полками.
   */
  selectedBayId?: string | null;
  /**
   * Ширина вида на бумаге, миллиметры.
   *
   * Из неё считаются толщины линий: они заданы в миллиметрах бумаги, а вид
   * рисуется в натурных миллиметрах мебели. Без этого числа контур при
   * 1:25 и при 1:50 выглядел бы разной толщины.
   */
  paperWidthMm?: number;
  /**
   * Детали ряда — ЧТОБЫ ПОДПИСАТЬ ПОЛКУ ЕЁ НОМЕРОМ.
   *
   * Список приходит с листа и считается там один раз: свой `buildPanels`
   * здесь был бы второй деталировкой, а разрез обязан показывать тот же
   * номер, что уехал в цех.
   */
  panels?: Panel[];
};

/**
 * Есть ли что показывать в разрезе.
 *
 * `fill` есть почти у каждого модуля, но у ниши под технику он пустой.
 * Считать его наполнением значит снова показать пустой корпус молча —
 * ту самую поломку, из-за которой вид и переделан.
 */
export function hasFilling(unit: Module): boolean {
  const fill = unit.fill;
  /*
   * У отсеков (R01) полки живут в отсеках — считаем их тем же счётом, что
   * раскрой; перегородка между отсеками — тоже наполнение.
   */
  return Boolean(
    fill && (fillShelfCount(fill) > 0 || fill.rodsMm.length > 0 || (fill.bays?.length ?? 0) > 1),
  );
}

/** Модуль по идентификатору и в каком он ряду: датум полок у них разный. */
export function findModuleRow(
  run: Run,
  moduleId: string | null | undefined,
): { unit: Module; upper: boolean } | null {
  if (!moduleId) return null;

  const base = run.modules.find((u) => u.id === moduleId);
  if (base) return { unit: base, upper: false };

  for (const segment of run.upperSegments) {
    const found = segment.modules.find((u) => u.id === moduleId);
    if (found) return { unit: found, upper: true };
  }

  return null;
}

/** Габарит разреза в натуре — по нему считается масштаб на листе. */
export function sectionSizeMm(run: Run): { width: number; height: number } {
  /*
   * Свес столешницы (`countertopDepth`) остаётся отраслевой константой —
   * в настройки цеха он не вынесен. А глубина корпуса — школа цеха.
   */
  const depth =
    Math.max(rowStandardDepthMm(run.zone, 'base', run.production), GEOMETRY.base.countertopDepth) + 40;
  return {
    width: PAD_LEFT + depth + PAD_RIGHT,
    height: PAD_TOP + run.ceilingHeightMm + PAD_BOTTOM,
  };
}

export default function SectionDrawing({
  run,
  inside = false,
  selectedModuleId,
  selectedBayId = null,
  panels = [],
  paperWidthMm,
}: Props) {
  const zone = zoneProfile(run.zone ?? 'kitchen');
  const size = sectionSizeMm(run);
  const ceiling = run.ceilingHeightMm;

  /** Пол внизу, потолок вверху: экранный Y растёт вниз. */
  const yOf = (mm: number) => PAD_TOP + (ceiling - mm);
  /** Стена слева, перёд мебели справа. */
  const xOf = (mm: number) => PAD_LEFT + mm;

  /*
   * ШКОЛА ЦЕХА, А НЕ АЛИАС НА GEOMETRY.
   *
   * Здесь стояло `const base = GEOMETRY.base` — и за этим алиасом
   * пряталась ЧЕТВЁРТАЯ копия рабочей поверхности:
   * `base.plinthH + base.carcassH + base.countertopH`. Разрез показывал
   * 858 цеху с боковиной 760, пока фасад рядом показывал 900.
   */
  const shop = run.production;
  const plinth = plinthMm(shop);
  const carcass = carcassHeightMm(shop);
  const counterH = countertopMm(shop);
  const upperBottom = upperBottomMm(shop);
  const upperDepth = rowStandardDepthMm(run.zone, 'upper', shop);

  const baseDepth = rowStandardDepthMm(run.zone, 'base', shop);
  const counterTop = workTopMm(shop);
  const hasUpper = run.upperSegments.length > 0;

  /*
   * ПОЛОСЫ ВИСЯЩИХ РЯДОВ — ИЗ ТОЙ ЖЕ ФУНКЦИИ, ЧТО СТАВИТ СЦЕНУ.
   *
   * Разрез рисовал ОДИН прямоугольник верхнего ряда: одна отметка, одна
   * глубина на всё, что висит. Антресоли в нём не было вовсе — а она и
   * висит выше, и глубже (у неё глубина нижнего ряда, школа цеха). На
   * разрезе её вынос вперёд виден лучше, чем на любом другом виде,
   * и именно его там не показывали.
   *
   * Полосы схлопываются по тройке «низ · верх · глубина»: четыре шкафа
   * одного ряда — это одна линия на разрезе, а не четыре наложенных.
   */
  const upperBands = (() => {
    const bands = new Map<string, { bottomMm: number; topMm: number; depthMm: number; id: string }>();

    for (const place of runPlaces(run)) {
      if (!isUpperRow(place.unit)) continue;

      const bottomMm = Math.round(place.y * 1000);
      const topMm = Math.round((place.y + place.heightM) * 1000);
      const depthMm = Math.round(place.depthM * 1000);
      const key = `${bottomMm}:${topMm}:${depthMm}`;

      if (!bands.has(key)) bands.set(key, { bottomMm, topMm, depthMm, id: place.unit.id });
    }

    return Array.from(bands.values());
  })();
  const upperTop = run.options.upperToCeiling ? ceiling : upperBottom + GEOMETRY.upper.carcassH;

  const line = 'var(--blueprint)';

  /*
   * Единиц вида в миллиметре бумаги. `viewBox` разреза совпадает с натурой,
   * поэтому отношение натурной ширины к ширине на бумаге и есть масштаб.
   */
  const u = unitsPerPaperMm(size.width, paperWidthMm ?? size.width / 25);
  const lw = lineWidths(u);
  const viewId = inside ? 'section-inside' : 'section';
  /** Штриховка сечения — то, что отличает разрез от вида. */
  const cut = `url(#${hatchId(viewId, 'section')})`;
  const numbers = moduleNumbers(run);

  /*
   * Наполнение показываем ТОЛЬКО выбранного модуля и ТОЛЬКО в его ряду:
   * полки нижней тумбы в верхнем шкафу — это чужая мебель на чужом месте.
   * Высоты в `fill` считаются от ДНА КОРПУСА, поэтому к ним прибавляется
   * низ ряда — цоколь внизу, отметка навески наверху.
   */
  const picked = inside ? findModuleRow(run, selectedModuleId) : null;

  /*
   * Полок в модуле несколько, а деталь одна: в раскрое это одна строка
   * с количеством. Поэтому подпись у всех полок разреза одна и та же —
   * номер той самой строки.
   */
  /*
   * ОТСЕКИ (R01): разрез идёт через ОДИН отсек — крайний левый, где есть
   * полки, — и так подписан. Высоты — из `bayLayout`, тех же чисел, что
   * режет цех; номер — строки полок этого отсека.
   */
  const pickedBays = picked ? bayLayout(picked.unit, bayEnvelope(picked.unit, run)) : null;
  /*
   * ЯЩИКИ (R02A.1): выбран отсек — разрез идёт через него; не выбран —
   * через отсек с ящиками: разрез и нужен, чтобы видеть ящик в глубину.
   * Без ящиков — как в R01, крайний левый с полками.
   */
  const sectionBay = pickedBays
    ? (pickedBays.bays.find((bay) => bay.id === selectedBayId) ??
      pickedBays.bays.find((bay) => bay.drawerStack) ??
      pickedBays.bays.find((bay) => bay.shelves.length > 0) ??
      pickedBays.bays[0])
    : null;
  const shelfNumber = picked
    ? sectionBay
      ? (panels?.find((panel) => panel.moduleId === picked.unit.id && panel.bayId === sectionBay.id)?.number ?? null)
      : panelNumberOf(panels, picked.unit.id, SHELF_PANEL_NAME)
    : null;
  const pickedFill =
    picked && hasFilling(picked.unit)
      ? sectionBay
        ? { ...picked.unit.fill!, shelves: sectionBay.shelves.map((shelf) => shelf.atMm) }
        : picked.unit.fill!
      : null;
  const fillDatum = picked?.upper ? upperBottom : plinth;
  const fillFrom = xOf(16);
  const fillTo = xOf((picked?.upper ? upperDepth : baseDepth) - 16);

  /*
   * ЯЩИКИ ОТСЕКА НА РАЗРЕЗЕ (R02A.1) — из той же `bayLayout`, что фасад, 3D
   * и раскрой: по высоте — от дна корпуса, по глубине — от передней кромки
   * (`zFromMm…zToMm`). Где стоит корпус выбранного модуля — `runPlaces`, та
   * же функция, что ставит его в сцену: разрез ряда рисует корпус нижнего
   * ряда, а шкаф бывает и 2400. Короба нет: его размеров никто не
   * подтверждал, габарит подписан справочным.
   */
  const pickedPlace = picked ? (runPlaces(run).find((place) => place.unit.id === picked.unit.id) ?? null) : null;
  const drawerStack = inside && pickedPlace && !picked!.upper ? (sectionBay?.drawerStack ?? null) : null;
  const moduleDepth = pickedBays?.envelope.depthMm ?? baseDepth;
  const moduleBottom = pickedPlace ? Math.round(pickedPlace.y * 1000) : 0;
  const moduleTop = pickedPlace ? Math.round((pickedPlace.y + pickedPlace.heightM) * 1000) : 0;
  const frontNumber = (partId: string) =>
    panels.find(
      (panel) =>
        panel.moduleId === picked?.unit.id && panel.name === DRAWER_FRONT_PANEL_NAME && panel.partIds?.includes(partId),
    )?.number ?? null;

  return (
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      width="100%"
      role="img"
      aria-label={`Боковой разрез ряда, глубина ${baseDepth} мм`}
    >
      <SheetDefs view={viewId} u={u} roles={['section']} />

      {/* Бумага под видом: лист белый и на экране тоже. */}
      <rect x={0} y={0} width={size.width} height={size.height} fill={PAPER_FILL.paper} />

      {/* Стена и пол: от них считаются все привязки. */}
      <line x1={xOf(0)} y1={yOf(ceiling)} x2={xOf(0)} y2={yOf(0)} stroke={line} strokeWidth={lw.contour} />
      <line
        x1={xOf(-120)}
        y1={yOf(0)}
        x2={xOf(baseDepth + 160)}
        y2={yOf(0)}
        stroke={line}
        strokeWidth={lw.contour}
      />
      <line
        x1={xOf(-120)}
        y1={yOf(ceiling)}
        x2={xOf(baseDepth + 160)}
        y2={yOf(ceiling)}
        stroke={line}
        strokeWidth={lw.axis}
        strokeDasharray={axisDash(u)}
      />

      {/* Цоколь: утоплен на 50 мм — по этой ступеньке мебель стоит на полу. */}
      <rect
        data-fill
        x={xOf(50)}
        y={yOf(plinth)}
        width={baseDepth - 50}
        height={plinth}
        fill={PAPER_FILL.carcass}
        stroke={line}
        strokeWidth={lw.inner}
      />

      {/*
        * Корпус нижнего ряда. В РАЗРЕЗЕ он заштрихован под 45°: это и есть
        * признак разрезанного материала, без которого разрез читается как
        * обычный вид сбоку. На виде — светло-серая заливка ЛДСП.
        */}
      <rect
        data-fill
        x={xOf(0)}
        y={yOf(plinth + carcass)}
        width={baseDepth}
        height={carcass}
        fill={inside ? cut : PAPER_FILL.carcass}
        stroke={line}
        strokeWidth={lw.contour}
      />

      {/*
        * Наполнение выбранного модуля: полки и штанги ИЗ `fill`, как есть.
        * Пересчитывать их здесь нельзя — они уже сели на систему 32, и
        * второй расчёт развёл бы разрез с фасадом, 3D и раскроем.
        */}
      {sectionBay && pickedFill && (
        <text
          data-section-bay={sectionBay.id}
          x={fillFrom + 12}
          y={yOf(fillDatum) - 18}
          fontSize={2.6 * u}
          fill="var(--graphite-mw)"
        >
          {`разрез по отсеку ${sectionBay.index + 1}`}
        </text>
      )}
      {pickedFill && !picked!.upper && (
        <Filling
          shelfNumber={shelfNumber}
          fill={pickedFill}
          datumMm={fillDatum}
          x1={fillFrom}
          x2={fillTo}
          yOf={yOf}
          stroke={line}
          inner={lw.inner}
          labelSize={2.6 * u}
        />
      )}

      {/*
        * ЯЩИКИ ОТСЕКА (R02A.1): корпус выбранного модуля контуром, фасады —
        * сечением на своей глубине, габарит — пунктиром за фасадом, высоты и
        * глубина — размерами. Номер фасада — строки «Фронт ящика» раскроя.
        */}
      {drawerStack && pickedPlace && (
        <g
          data-section-drawer-stack={drawerStack.id}
          data-bay={drawerStack.bayId}
          data-from-mm={drawerStack.fromMm}
          data-to-mm={drawerStack.toMm}
          data-height-mm={drawerStack.heightMm}
          data-depth-mm={drawerStack.depthMm}
        >
          <rect
            data-section-module={picked!.unit.id}
            data-bottom-mm={moduleBottom}
            data-top-mm={moduleTop}
            data-depth-mm={moduleDepth}
            x={xOf(0)}
            y={yOf(moduleTop)}
            width={moduleDepth}
            height={moduleTop - moduleBottom}
            fill="none"
            stroke={line}
            strokeWidth={lw.contour}
          />
          {drawerStack.drawers.map((drawer) => {
            const env = drawer.envelope;
            const front = drawer.front;
            const number = frontNumber(front.partId);
            return (
              <g key={drawer.id}>
                <rect
                  data-section-drawer-envelope={drawer.id}
                  data-depth-mm={env.depthMm}
                  data-depth-from-mm={moduleDepth + env.zFromMm}
                  data-depth-to-mm={moduleDepth + env.zToMm}
                  data-y-from-mm={env.yFromMm}
                  data-y-to-mm={env.yToMm}
                  x={xOf(moduleDepth + env.zFromMm)}
                  y={yOf(moduleBottom + env.yToMm)}
                  width={env.zToMm - env.zFromMm}
                  height={env.yToMm - env.yFromMm}
                  fill="none"
                  stroke={line}
                  strokeWidth={lw.inner}
                  strokeDasharray={axisDash(u)}
                />
                <rect
                  data-section-drawer-front={front.partId}
                  data-y-from-mm={front.yFromMm}
                  data-y-to-mm={front.yToMm}
                  data-depth-from-mm={moduleDepth + front.zFromMm}
                  data-depth-to-mm={moduleDepth + front.zToMm}
                  x={xOf(moduleDepth + front.zFromMm)}
                  y={yOf(moduleBottom + front.yToMm)}
                  width={front.zToMm - front.zFromMm}
                  height={front.heightMm}
                  fill={PAPER_FILL.front}
                  stroke={line}
                  strokeWidth={lw.contour}
                />
                {/* Подпись — внутри габарита: справа от корпуса поле узкое, и при 1:20 текст обрезался. */}
                <text
                  className="mw-num"
                  x={xOf(moduleDepth + env.zFromMm) + 16}
                  y={yOf(moduleBottom + (front.yFromMm + front.yToMm) / 2) + 0.9 * u}
                  fontSize={2.6 * u}
                  fill={line}
                >
                  {number ? `${number} · ${front.heightMm}` : front.heightMm}
                </text>
              </g>
            );
          })}
          <Vertical
            from={moduleBottom + drawerStack.fromMm}
            to={moduleBottom + drawerStack.toMm}
            x={moduleDepth + 150}
            label={`${drawerStack.heightMm}`}
            yOf={yOf}
            xOf={xOf}
            lw={lw.dimension}
            fontSize={2.6 * u}
          />
          <Horizontal
            from={moduleDepth + (drawerStack.drawers[0]?.envelope.zFromMm ?? 0)}
            to={moduleDepth + (drawerStack.drawers[0]?.envelope.zToMm ?? 0)}
            y={moduleBottom + drawerStack.toMm + 70}
            label={`${drawerStack.depthMm}`}
            yOf={yOf}
            xOf={xOf}
            lw={lw.dimension}
            fontSize={2.6 * u}
          />
          {/*
            * Две короткие строки в свободной части отсека над блоком: блок и
            * габарит названы размерами, здесь — чьи ящики и что короба нет.
            */}
          <text
            x={xOf(24)}
            y={yOf(moduleBottom + drawerStack.toMm + 600)}
            fontSize={2.6 * u}
            fill="var(--graphite-mw)"
            data-section-drawer-note
          >
            <tspan x={xOf(24)}>{`ящики отсека ${(sectionBay?.index ?? 0) + 1}`}</tspan>
            <tspan x={xOf(24)} dy={3.4 * u}>
              короб не рассчитан
            </tspan>
          </text>
        </g>
      )}

      {/* Фасад впереди корпуса — на свою толщину. */}
      {!inside && (
        <rect
          data-fill
          x={xOf(baseDepth)}
          y={yOf(plinth + carcass)}
          width={GEOMETRY.base.frontDepth}
          height={carcass}
          fill={PAPER_FILL.front}
          stroke={line}
          strokeWidth={lw.contour}
        />
      )}

      {/* Столешница со свесом: торец 38 мм — по нему ряд читается кухней. */}
      {zone.hasCountertop && (
        <rect
          data-fill
          x={xOf(0)}
          y={yOf(counterTop)}
          width={GEOMETRY.base.countertopDepth}
          height={counterH}
          // Столешница в разрезе — тёмная узкая полоса: по ней ряд читается
          // кухней с одного взгляда.
          fill={PAPER_FILL.countertop}
          stroke={line}
          strokeWidth={lw.contour}
        />
      )}

      {/* Верхний ряд. */}
      {hasUpper && (
        <>
          {upperBands.map((band) => (
            <rect
              key={band.id}
              data-fill
              /*
               * Плоскости наружу: приёмка сверяет их с `runPlaces`, а не
               * смотрит на картинку. Задняя у всех рядов — стена, ноль.
               */
              data-module-id={band.id}
              data-back-mm={0}
              data-front-mm={band.depthMm}
              x={xOf(0)}
              y={yOf(band.topMm)}
              width={band.depthMm}
              height={band.topMm - band.bottomMm}
              fill={inside ? cut : PAPER_FILL.carcass}
              stroke={line}
              strokeWidth={lw.contour}
            />
          ))}
          {pickedFill && picked!.upper && (
            <Filling
              shelfNumber={shelfNumber}
              fill={pickedFill}
              datumMm={fillDatum}
              x1={fillFrom}
              x2={fillTo}
              yOf={yOf}
              stroke={line}
              inner={lw.inner}
              labelSize={2.6 * u}
            />
          )}
        </>
      )}

      {/* ── Размеры. Вертикальная цепочка слева, глубина снизу ── */}
      <Vertical from={0} to={counterTop} x={-70} label={`${counterTop}`} yOf={yOf} xOf={xOf} lw={lw.dimension} fontSize={2.6 * u} />
      {hasUpper && (
        <Vertical
          from={counterTop}
          to={upperBottom}
          x={-160}
          label={`${upperBottom - counterTop}`}
          yOf={yOf}
          xOf={xOf}
          lw={lw.dimension}
          fontSize={2.6 * u}
        />
      )}
      <Vertical from={0} to={ceiling} x={-235} label={`${ceiling}`} yOf={yOf} xOf={xOf} lw={lw.dimension} fontSize={2.6 * u} />

      {/*
        * НОМЕР ПОЗИЦИИ МОДУЛЯ — тот же, что на фасаде и в детализировке.
        * По нему цех сверяет деталь с чертежом; без него список деталей
        * сопоставляют по подписи, а одинаковых подписей на ряде несколько.
        */}
      {picked && (
        <PositionMark
          n={numbers.get(picked.unit.id) ?? 0}
          cx={xOf(baseDepth / 2)}
          cy={yOf(picked.upper ? upperTop + 90 : plinth + carcass + 90)}
          u={u}
          lw={lw.inner}
        />
      )}

      {/*
        * ВИД ГОВОРИТ, ЧТО НА НЁМ ЕСТЬ. Пустой корпус без единого слова
        * читается как «полок не будет» — а это неправда, полки просто не
        * выбраны. Молчащий разрез ненамного лучше выдуманного.
        */}
      {inside && !pickedFill && (
        <text
          className="mw-num"
          x={xOf(baseDepth / 2)}
          y={yOf(plinth + carcass / 2)}
          fontSize={62}
          fill="var(--graphite-mw)"
          textAnchor="middle"
        >
          {picked
            ? `${picked.unit.label}: полок и штанг нет`
            : 'выберите модуль, чтобы увидеть наполнение'}
        </text>
      )}

      <Horizontal from={0} to={baseDepth} y={-70} label={`${baseDepth}`} yOf={yOf} xOf={xOf} lw={lw.dimension} fontSize={2.6 * u} />
      {zone.hasCountertop && (
        <Horizontal
          from={0}
          to={GEOMETRY.base.countertopDepth}
          y={-140}
          label={`${GEOMETRY.base.countertopDepth}`}
          yOf={yOf}
          xOf={xOf}
          lw={lw.dimension}
          fontSize={2.6 * u}
        />
      )}
    </svg>
  );
}

/**
 * Полки и штанги в разрезе.
 *
 * Высоты приходят из `fill` — от дна корпуса, — и переводятся в высоту от
 * пола прибавлением `datumMm`. Штанга в разрезе это труба поперёк, поэтому
 * кружок, а не линия: так её и рисуют в мебельных чертежах.
 */
function Filling({
  shelfNumber,
  fill,
  datumMm,
  x1,
  x2,
  yOf,
  stroke,
  inner,
  labelSize,
}: {
  /** Номер детали «Полка» этого модуля. Полок несколько, деталь одна. */
  shelfNumber: string | null;
  fill: ModuleFill;
  datumMm: number;
  x1: number;
  x2: number;
  yOf: (mm: number) => number;
  stroke: string;
  /** Толщина внутренней линии в единицах вида. */
  inner: number;
  labelSize: number;
}) {
  return (
    <g>
      {fill.shelves.map((mm) => (
        <g key={`shelf-${mm}`}>
          <line
            x1={x1}
            y1={yOf(datumMm + mm)}
            x2={x2}
            y2={yOf(datumMm + mm)}
            stroke={stroke}
            strokeWidth={inner}
          />
          <text
            className="mw-num"
            x={x1 + 12}
            y={yOf(datumMm + mm) - 14}
            fontSize={labelSize}
            fill="var(--graphite-mw)"
          >
            {shelfNumber ? `${shelfNumber} · ${mm}` : mm}
          </text>
        </g>
      ))}

      {fill.rodsMm.map((mm) => (
        <circle
          key={`rod-${mm}`}
          cx={(x1 + x2) / 2}
          cy={yOf(datumMm + mm)}
          r={16}
          fill="none"
          stroke={stroke}
          strokeWidth={inner}
        />
      ))}
    </g>
  );
}

/**
 * Кружок с номером позиции.
 *
 * Диаметр 7 мм бумаги — отраслевой: меньше не читается с листа на стене
 * объекта, больше загораживает чертёж. Белая заливка обязательна: кружок
 * ставится поверх графики, и без неё номер сливается с линиями под ним.
 */
export function PositionMark({
  n,
  cx,
  cy,
  u,
  lw,
  leaderTo,
}: {
  n: number;
  cx: number;
  cy: number;
  u: number;
  lw: number;
  /** Y, к которому тянется выноска. Пусто — кружок стоит сам по себе. */
  leaderTo?: number;
}) {
  if (!n) return null;
  const r = (POSITION_CIRCLE_MM / 2) * u;

  return (
    <g>
      {/* Выноска у узкого модуля: внутри него кружку места нет. */}
      {leaderTo !== undefined && (
        <line
          x1={cx}
          y1={cy + (leaderTo > cy ? r : -r)}
          x2={cx}
          y2={leaderTo}
          stroke="var(--blueprint)"
          strokeWidth={lw}
        />
      )}
      <circle cx={cx} cy={cy} r={r} fill={PAPER_FILL.paper} stroke="var(--blueprint)" strokeWidth={lw} />
      <text
        className="mw-num"
        x={cx}
        y={cy + r * 0.36}
        fontSize={r * 1.1}
        textAnchor="middle"
        fill="var(--ink)"
        stroke="none"
      >
        {n}
      </text>
    </g>
  );
}

/* ─────────────────────────  Размерные линии  ───────────────────────── */

type DimProps = {
  label: string;
  yOf: (mm: number) => number;
  xOf: (mm: number) => number;
  /** Толщина размерной линии и кегль подписи — в единицах вида. */
  lw: number;
  fontSize: number;
};

function Vertical({
  from,
  to,
  x,
  label,
  yOf,
  xOf,
  lw,
  fontSize,
}: DimProps & { from: number; to: number; x: number }) {
  const px = xOf(x);
  return (
    <g stroke="var(--blueprint)" strokeWidth={lw}>
      <line x1={px} y1={yOf(from)} x2={px} y2={yOf(to)} />
      <line x1={px - 20} y1={yOf(from)} x2={px + 20} y2={yOf(from)} />
      <line x1={px - 20} y1={yOf(to)} x2={px + 20} y2={yOf(to)} />
      <text
        className="mw-num"
        x={px - 12}
        y={(yOf(from) + yOf(to)) / 2}
        fontSize={fontSize}
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
  lw,
  fontSize,
}: DimProps & { from: number; to: number; y: number }) {
  const py = yOf(y);
  return (
    <g stroke="var(--blueprint)" strokeWidth={lw}>
      <line x1={xOf(from)} y1={py} x2={xOf(to)} y2={py} />
      <line x1={xOf(from)} y1={py - 20} x2={xOf(from)} y2={py + 20} />
      <line x1={xOf(to)} y1={py - 20} x2={xOf(to)} y2={py + 20} />
      <text
        className="mw-num"
        x={(xOf(from) + xOf(to)) / 2}
        y={py - 18}
        fontSize={fontSize}
        fill="var(--blueprint)"
        stroke="none"
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}
