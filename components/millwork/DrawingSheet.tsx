'use client';

import type { ReactNode } from 'react';
import ElevationDrawing, { elevationSpanUnits } from './ElevationDrawing';
import { buildLeaders } from '@/lib/millwork/leaders';
import { buildPanels } from '@/lib/millwork/panels';
import { useInteriorStore } from '@/store/useInteriorStore';
import { APRON_TARGET, COUNTERTOP_TARGET, FACADE_TARGET } from '@/types/catalog';
import PlanDrawing from './PlanDrawing';
import AxonometryDrawing from './AxonometryDrawing';
import SectionDrawing, { findModuleRow, hasFilling, sectionSizeMm } from './SectionDrawing';
import { axonometryExtentMm } from '@/lib/millwork/axonometry';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import SheetLayout, { type SheetViewNode } from './SheetLayout';
import SheetNotes from './SheetNotes';
import { PRODUCT_TITLE, moduleNumbers, positionCode } from '@/lib/millwork/positions';
import SheetLegend, { type LegendMaterial } from './SheetLegend';
import { scaleLabel } from '@/lib/millwork/sheet';
import {
  DRAW_FIELD,
  chooseFormat,
  fitComposition,
  fitExtra,
  viewWidthMm,
  type ScaleDenominator,
} from '@/lib/millwork/sheet';
import { GEOMETRY } from '@/lib/millwork/modules';
import type { CommPoint, LayoutIssue, Run } from '@/types/millwork';
import type { CarcassItem } from '@/lib/millwork/carcassMaterial';
import type { VariantOption } from './ElevationDrawing';
import type { DrawingMode } from './ElevationDrawing';

/**
 * ЛИСТ ЧЕРТЕЖА, А НЕ ОДИН ВИД.
 *
 * Раньше это была рамка вокруг одного рисунка: фасад ИЛИ план, по очереди.
 * Мебель по такому листу не соберёшь — проектировщик держит перед глазами
 * фасад, оба разреза и план разом, потому что вопросы между ними и живут:
 * «пройдёт ли столешница мимо подоконника», «что там за фасадом».
 *
 * Синька: тёмно-синее поле, светлые линии, штамп в правом нижнем углу.
 * При печати инвертируется в обычный чертёж — лист вешают на стене объекта,
 * и там нужен белый фон с чёрными линиями.
 */

/** Поля вида фасада в условных единицах: подпись слева, цепочка снизу. */
const ELEVATION_MARGIN_UNITS = 22 + 56 + 16;
/** Поля плана: отступ сверху, проход и подписи снизу. */
const PLAN_MARGIN_UNITS = 34 + 78;

type ElevationHandlers = {
  assumedTotal?: boolean;
  selectedModuleId?: string | null;
  onSelect?: (moduleId: string) => void;
  changedIds?: string[];
  mode?: DrawingMode;
  onFillChange?: Parameters<typeof ElevationDrawing>[0]['onFillChange'];
  onFillReject?: Parameters<typeof ElevationDrawing>[0]['onFillReject'];
  onMoveAppliance?: Parameters<typeof ElevationDrawing>[0]['onMoveAppliance'];
  onMoveModule?: Parameters<typeof ElevationDrawing>[0]['onMoveModule'];
  variants?: VariantOption[];
  onVariant?: (kind: VariantOption['kind']) => void;
};

type Props = {
  /**
   * СОСЕДНИЕ РЯДЫ УГЛОВОЙ КУХНИ.
   *
   * Лист рисовал ровно один ряд, и угловая кухня приезжала в цех
   * половиной себя. Каждый ряд идёт СВОЕЙ развёрткой со своими
   * размерами — сводить их в один вид нельзя: стены перпендикулярны, и
   * общая размерная цепочка по ним ничего не значит.
   *
   * План при этом один: на нём угол и виден.
   */
  otherRuns?: { label: string; run: Run }[];
  title: string;
  zone: string;
  measuredBy: string;
  measuredAt: string;
  /** Комплектация: в штампе она идёт вместе с названием изделия. */
  variantTitle?: string;
  /** Что осталось незамеренным. Внизу листа это обязательная строка. */
  pending?: string[];
  /** Пожелания со слов клиента — примечания чертежа. */
  notes?: string;
  run: Run;
  comms: CommPoint[];
  issues?: LayoutIssue[];
  /** Толщины и зазоры цеха: аксонометрия строится по ним же. */
  production?: ProductionSettings;
  /**
   * МАТЕРИАЛЫ КОРПУСА ОРГАНИЗАЦИИ: по ним лист называет декор корпуса.
   * Пусто — обычная плита цеха, как и раньше.
   */
  carcass?: Map<string, CarcassItem>;
  /** Правки идут по фасаду: он остаётся живым, а не картинкой на листе. */
  elevation?: ElevationHandlers;
  /** Заказчик — в штамп: лист уходит и ему тоже. */
  client?: string;
  /** Компания: логотип и телефон в штампе. */
  company?: { name?: string; phone?: string; logoUrl?: string | null };
  /**
   * Номер позиции по объекту. Нумерация сквозная: два «поз.1» на объекте —
   * это спор бригад при разгрузке.
   */
  position?: number;
};

export default function DrawingSheet({
  otherRuns = [],
  title,
  zone,
  measuredBy,
  measuredAt,
  pending = [],
  notes,
  run,
  comms,
  issues = [],
  production = DEFAULT_PRODUCTION,
  carcass,
  elevation = {},
  client,
  company,
  position = 1,
}: Props) {
  /*
   * Габариты видов В НАТУРЕ: из них считается масштаб. У фасада и плана
   * поля вокруг рисунка заданы в условных единицах, поэтому переводим их
   * в миллиметры мебели тем же коэффициентом, что и сам рисунок.
   */
  /*
   * МАТЕРИАЛЫ БЕРУТСЯ ИЗ КАТАЛОГА КОМПАНИИ вместе с артикулом. Не выбран —
   * в выноске идёт общее описание, и по нему видно, что материал ещё не
   * согласован: это честнее, чем подставить правдоподобное название.
   */
  const selections = useInteriorStore((s) => s.selections);
  const catalog = useInteriorStore((s) => s.catalog);
  const entryFor = (target: string) => {
    const id = selections[target];
    return (id && catalog.find((e) => e.id === id)) || null;
  };

  /*
   * ДЕТАЛИ СЧИТАЮТСЯ ОДИН РАЗ НА ЛИСТ — как и номера модулей ниже.
   *
   * Выноска, разрез и детализировка обязаны показывать один номер
   * детали: посчитай список в каждом виде своим вызовом, и при разных
   * настройках цеха цех получит на чертеже одну «3.2», а в раскрое
   * другую.
   */
  const panels = buildPanels({ run, production, carcass });

  const leaders = buildLeaders(run, panels, {
    facade: entryFor(FACADE_TARGET),
    counter: entryFor(COUNTERTOP_TARGET),
    apron: entryFor(APRON_TARGET),
  });

  /*
   * ПОДПИСЬ ВИДА НАЗЫВАЕТ ТО, ЧТО НА ВИДЕ ЕСТЬ.
   *
   * Разрез один на ряд, а наполнение у каждого модуля своё: без выбранного
   * модуля показывать нечего. Подпись «Разрез с наполнением» над пустым
   * корпусом — обещание, которого вид не выполняет.
   */
  /*
   * Номера модулей считаются ОДИН раз на лист и раздаются видам: фасад,
   * разрез и детализировка обязаны показывать один и тот же номер, иначе
   * цех сверяет деталь не с той позицией.
   */
  const positions = moduleNumbers(run);

  /*
   * МАТЕРИАЛЫ ЛЕГЕНДЫ — ИЗ КАТАЛОГА, а не из списка в коде. Тот же
   * источник, что у выносок: не выбран артикул — так и написано.
   */
  const legendMaterials: LegendMaterial[] = (
    [
      ['Фасады', entryFor(FACADE_TARGET)],
      ['Столешница', entryFor(COUNTERTOP_TARGET)],
      ['Фартук', entryFor(APRON_TARGET)],
    ] as const
  ).flatMap(([where, entry]) =>
    entry ? [{ where, name: entry.name_ru, article: entry.article }] : [],
  );

  const pickedRow = findModuleRow(run, elevation.selectedModuleId);
  const insideTitle = !pickedRow
    ? 'Разрез: модуль не выбран'
    : hasFilling(pickedRow.unit)
      ? `Разрез с наполнением · ${pickedRow.unit.label}`
      : `Разрез без наполнения · ${pickedRow.unit.label}`;

  const elevationSpan = elevationSpanUnits(true);

  const mmPerUnit = run.lengthMm / DRAW_FIELD.draw;

  const elevationReal = {
    width: run.lengthMm * (elevationSpan / DRAW_FIELD.draw),
    height: run.ceilingHeightMm + ELEVATION_MARGIN_UNITS * mmPerUnit,
  };

  const planDepth = GEOMETRY.base.countertopDepth;
  const planReal = {
    width: elevationReal.width,
    height: planDepth + 90 * mmPerUnit + PLAN_MARGIN_UNITS * mmPerUnit,
  };

  const sectionReal = sectionSizeMm(run);
  const axonReal = axonometryExtentMm(run, 'closed', {
    thicknessMm: production.carcassMm,
    frontMm: production.frontMm,
    gapMm: production.frontGapMm,
  });

  const format = chooseFormat({ lengthMm: run.lengthMm, views: 6 });

  /*
   * ОДИН МАСШТАБ НА ВЕСЬ ЛИСТ. Так делает проектировщик: глаз
   * перестраивается один раз, и размеры сравниваются между видами
   * напрямую. Выбирается самый крупный, при котором лист складывается
   * в одну страницу.
   */
  /*
   * РАСКЛАДКА ЛИСТА: ОДИН ВИД — ОДИН БЛОК.
   *
   *   ┌──────────────────────────────────────┐
   *   │ Фасад ряда           — весь верх     │
   *   ├──────────────────────────────────────┤
   *   │ Разрез  │  Разрез с наполнением      │
   *   ├──────────────────────────────────────┤
   *   │ План                                 │
   *   └──────────────────────────────────────┘
   *
   * Раньше три вида жались в одну полосу и выходили мелкими. Фасад —
   * главный вид, по нему читают изделие, и делить с ним строку нечему.
   * Разрезы читаются парой и потому стоят рядом. План — своей строкой.
   *
   * `breakRow` начинает новую строку; фасад и план стоят в своих строках
   * поодиночке, потому что строку начинает и следующий за ними вид.
   */
  const sizesFor = (den: ScaleDenominator) => [
    {
      id: 'elevation',
      title: otherRuns.length > 0 ? 'Фасад: стена А' : 'Фасад ряда',
      widthMm: viewWidthMm(run.lengthMm, den, elevationSpan),
      heightMm: elevationReal.height / den,
      breakRow: true,
    },
    /*
     * Развёртка каждой соседней стены — своим видом и своей строкой.
     * Масштаб общий на лист (ловушка 197): по развёрткам МЕРЯТ, и разный
     * масштаб у двух половин одной кухни читается как ошибка построения.
     */
    ...otherRuns.map((other, i) => ({
      id: `elevation-${i + 1}`,
      title: `Фасад: ${other.label.toLowerCase()}`,
      widthMm: viewWidthMm(other.run.lengthMm, den, elevationSpan),
      heightMm: elevationReal.height / den,
      breakRow: true,
    })),
    {
      id: 'section',
      title: 'Разрез боковой',
      widthMm: sectionReal.width / den,
      heightMm: sectionReal.height / den,
      breakRow: true,
    },
    {
      id: 'section-inside',
      title: insideTitle,
      widthMm: sectionReal.width / den,
      heightMm: sectionReal.height / den,
    },
    {
      id: 'plan',
      title: 'План',
      widthMm: viewWidthMm(run.lengthMm, den),
      heightMm: planReal.height / den,
      // План встаёт под разрезами, а не сбоку: так их и читают.
      breakRow: true,
    },
  ];

  /*
   * Метрические виды — в ОДНОМ масштабе: по ним мерят, и глаз должен
   * перестраиваться один раз.
   */
  const { den } = fitComposition(sizesFor, format);

  /*
   * Аксонометрия пристраивается к готовому листу в СВОЁМ масштабе. По ней
   * не мерят, и тянуть из-за неё фасад с планом в 1:50 значит испортить
   * ровно те виды, ради которых лист и печатают.
   */
  const axonSizesFor = (axonDen: ScaleDenominator) => [
    {
      id: 'axon',
      title: 'Аксонометрия',
      widthMm: axonReal.width / axonDen,
      heightMm: axonReal.height / axonDen,
      /*
       * Объём — на ОТДЕЛЬНОМ листе. Первый лист остаётся чистым: на нём
       * только виды, по которым снимают размеры. По аксонометрии не мерят,
       * и место рядом с фасадом она занимает зря.
       */
      breakPage: true,
    },
    {
      id: 'axon-inside',
      title: 'Аксонометрия · наполнение',
      widthMm: axonReal.width / axonDen,
      heightMm: axonReal.height / axonDen,
    },
  ];

  const axon = fitExtra(sizesFor(den), axonSizesFor, format);

  /*
   * ШИРИНА ВИДА НА БУМАГЕ — ЕДИНСТВЕННЫЙ МОСТ К ТОЛЩИНАМ ЛИНИЙ.
   *
   * Толщины заданы в миллиметрах бумаги (`LINE_MM`), а рисуются виды в
   * своих единицах: у фасада это условные единицы поля, у разреза —
   * натурные миллиметры. Пересчёт возможен только здесь, где известно и
   * то, и другое: вид шириной `viewBox` печатается полосой `widthMm`.
   *
   * Без него контур при 1:25 и при 1:50 выглядел бы разной толщины — то
   * есть ровно так же неверно, как размер, снятый не в масштабе.
   */
  const paperWidth = new Map(sizesFor(den).map((view) => [view.id, view.widthMm]));
  const axonWidth = new Map(axonSizesFor(axon.den).map((view) => [view.id, view.widthMm]));

  const render: Record<string, ReactNode> = {
    elevation: (
      <ElevationDrawing
        run={run}
        {...elevation}
        leaders={leaders}
        paperWidthMm={paperWidth.get('elevation')}
        positions={positions}
      />
    ),
    ...Object.fromEntries(
      otherRuns.map((other, i) => [
        `elevation-${i + 1}`,
        <ElevationDrawing
          key={`elev-${i}`}
          run={other.run}
          selectedModuleId={elevation.selectedModuleId}
          onSelect={elevation.onSelect}
          leaders={[]}
          paperWidthMm={paperWidth.get(`elevation-${i + 1}`)}
        />,
      ]),
    ),
    section: (
      <SectionDrawing run={run} panels={panels} paperWidthMm={paperWidth.get('section')} />
    ),
    'section-inside': (
      <SectionDrawing
        run={run}
        panels={panels}
        inside
        selectedModuleId={elevation.selectedModuleId}
        paperWidthMm={paperWidth.get('section-inside')}
      />
    ),
    plan: (
      <PlanDrawing
        run={run}
        comms={comms}
        issues={issues}
        selectedModuleId={elevation.selectedModuleId}
        onSelect={elevation.onSelect}
        paperWidthMm={paperWidth.get('plan')}
      />
    ),
    axon: (
      <AxonometryDrawing
        run={run}
        production={production}
        paperWidthMm={axonWidth.get('axon')}
      />
    ),
    'axon-inside': (
      <AxonometryDrawing
        run={run}
        mode="inside"
        production={production}
        paperWidthMm={axonWidth.get('axon-inside')}
      />
    ),
  };

  const views: SheetViewNode[] = [
    ...sizesFor(den).map((view) => ({ ...view, scaleDen: den, render: render[view.id] })),
    ...axonSizesFor(axon.den).map((view) => ({
      ...view,
      scaleDen: axon.den,
      render: render[view.id],
    })),
  ];

  return (
    /*
     * ЛИСТ ЛЕЖИТ НА ТЁМНОМ ИНТЕРФЕЙСЕ, КАК БУМАГА НА СТОЛЕ.
     *
     * `mw-paper` переопределяет цвета чертежа НА КОНТЕЙНЕРЕ: белый фон,
     * чёрные линии — и на экране тоже, а не только в печати. За его
     * пределами приложение остаётся тёмным.
     */
    <div className="mw-paper mw-sheet mx-auto w-full p-4 sm:p-6 print:border-0 print:p-0 print:shadow-none">
      <SheetLayout
        format={format}
        views={views}
        footer={({ label }) => (
          <SheetNotes
            fields={{
              object: title,
              product: PRODUCT_TITLE[run.zone ?? 'kitchen'] ?? zone,
              position: positionCode(position),
              author: measuredBy,
              client,
              date: measuredAt,
              scale: scaleLabel(den),
              sheet: label,
              company: company?.name,
              phone: company?.phone,
              logoUrl: company?.logoUrl ?? null,
            }}
            pending={pending}
            notes={notes}
          >
            <SheetLegend materials={legendMaterials} />
          </SheetNotes>
        )}
      />
    </div>
  );
}
