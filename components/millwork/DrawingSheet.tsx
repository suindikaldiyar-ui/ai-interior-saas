'use client';

import type { ReactNode } from 'react';
import ElevationDrawing, { elevationSpanUnits } from './ElevationDrawing';
import { buildLeaders } from '@/lib/millwork/leaders';
import { useInteriorStore } from '@/store/useInteriorStore';
import { APRON_TARGET, COUNTERTOP_TARGET, FACADE_TARGET } from '@/types/catalog';
import PlanDrawing from './PlanDrawing';
import AxonometryDrawing from './AxonometryDrawing';
import SectionDrawing, { sectionSizeMm } from './SectionDrawing';
import { axonometryExtentMm } from '@/lib/millwork/axonometry';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import SheetLayout, { type SheetViewNode } from './SheetLayout';
import SheetNotes from './SheetNotes';
import { PRODUCT_TITLE, positionCode } from '@/lib/millwork/positions';
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
  onMoveAppliance?: Parameters<typeof ElevationDrawing>[0]['onMoveAppliance'];
  variants?: VariantOption[];
  onVariant?: (kind: VariantOption['kind']) => void;
};

type Props = {
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

  const leaders = buildLeaders(run, {
    facade: entryFor(FACADE_TARGET),
    counter: entryFor(COUNTERTOP_TARGET),
    apron: entryFor(APRON_TARGET),
  });

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
  const sizesFor = (den: ScaleDenominator) => [
    {
      id: 'elevation',
      title: 'Фасад ряда',
      widthMm: viewWidthMm(run.lengthMm, den, elevationSpan),
      heightMm: elevationReal.height / den,
    },
    {
      id: 'section',
      title: 'Разрез боковой',
      widthMm: sectionReal.width / den,
      heightMm: sectionReal.height / den,
    },
    {
      id: 'section-inside',
      title: 'Разрез с наполнением',
      widthMm: sectionReal.width / den,
      heightMm: sectionReal.height / den,
    },
    {
      id: 'plan',
      title: 'План',
      widthMm: viewWidthMm(run.lengthMm, den),
      heightMm: planReal.height / den,
      // План встаёт под фасадом, а не сбоку от разреза: так их и читают.
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
    },
    {
      id: 'axon-inside',
      title: 'Аксонометрия · наполнение',
      widthMm: axonReal.width / axonDen,
      heightMm: axonReal.height / axonDen,
    },
  ];

  const axon = fitExtra(sizesFor(den), axonSizesFor, format);

  const render: Record<string, ReactNode> = {
    elevation: <ElevationDrawing run={run} {...elevation} leaders={leaders} />,
    section: <SectionDrawing run={run} />,
    'section-inside': <SectionDrawing run={run} inside />,
    plan: (
      <PlanDrawing
        run={run}
        comms={comms}
        issues={issues}
        selectedModuleId={elevation.selectedModuleId}
        onSelect={elevation.onSelect}
      />
    ),
    axon: <AxonometryDrawing run={run} production={production} />,
    'axon-inside': <AxonometryDrawing run={run} mode="inside" production={production} />,
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
    <div className="mw-sheet mx-auto w-full p-4 sm:p-6 print:border-0 print:p-0 print:shadow-none">
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
          />
        )}
      />
    </div>
  );
}
