'use client';

import type { ReactNode } from 'react';
import ElevationDrawing from './ElevationDrawing';
import PlanDrawing from './PlanDrawing';
import SectionDrawing, { sectionSizeMm } from './SectionDrawing';
import SheetLayout, { type SheetViewNode } from './SheetLayout';
import {
  DRAW_FIELD,
  chooseFormat,
  fitComposition,
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
  variantTitle: string;
  /** Что осталось незамеренным. Внизу листа это обязательная строка. */
  pending?: string[];
  /** Пожелания со слов клиента — примечания чертежа. */
  notes?: string;
  run: Run;
  comms: CommPoint[];
  issues?: LayoutIssue[];
  /** Правки идут по фасаду: он остаётся живым, а не картинкой на листе. */
  elevation?: ElevationHandlers;
};

export default function DrawingSheet({
  title,
  zone,
  measuredBy,
  measuredAt,
  variantTitle,
  pending = [],
  notes,
  run,
  comms,
  issues = [],
  elevation = {},
}: Props) {
  /*
   * Габариты видов В НАТУРЕ: из них считается масштаб. У фасада и плана
   * поля вокруг рисунка заданы в условных единицах, поэтому переводим их
   * в миллиметры мебели тем же коэффициентом, что и сам рисунок.
   */
  const mmPerUnit = run.lengthMm / DRAW_FIELD.draw;

  const elevationReal = {
    width: run.lengthMm * (DRAW_FIELD.total / DRAW_FIELD.draw),
    height: run.ceilingHeightMm + ELEVATION_MARGIN_UNITS * mmPerUnit,
  };

  const planDepth = GEOMETRY.base.countertopDepth;
  const planReal = {
    width: elevationReal.width,
    height: planDepth + 90 * mmPerUnit + PLAN_MARGIN_UNITS * mmPerUnit,
  };

  const sectionReal = sectionSizeMm(run);

  const format = chooseFormat({ lengthMm: run.lengthMm, views: 4 });

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
      widthMm: viewWidthMm(run.lengthMm, den),
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

  const { den } = fitComposition(sizesFor, format);

  const render: Record<string, ReactNode> = {
    elevation: <ElevationDrawing run={run} {...elevation} />,
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
  };

  const views: SheetViewNode[] = sizesFor(den).map((view) => ({
    ...view,
    scaleDen: den,
    render: render[view.id],
  }));

  return (
    <div className="mw-sheet mx-auto w-full p-4 sm:p-6 print:border-0 print:p-0 print:shadow-none">
      <SheetLayout
        format={format}
        views={views}
        footer={({ label }) => (
          <Footer
            title={title}
            zone={zone}
            measuredBy={measuredBy}
            measuredAt={measuredAt}
            variantTitle={variantTitle}
            pending={pending}
            notes={notes}
            sheetLabel={label}
          />
        )}
      />
    </div>
  );
}

/**
 * Примечания и штамп. Повторяются на КАЖДОМ листе: второй лист без штампа
 * на объекте становится ничьим — по нему не найти ни объект, ни замерщика.
 */
function Footer({
  title,
  zone,
  measuredBy,
  measuredAt,
  variantTitle,
  pending,
  notes,
  sheetLabel,
}: {
  title: string;
  zone: string;
  measuredBy: string;
  measuredAt: string;
  variantTitle: string;
  pending: string[];
  notes?: string;
  sheetLabel: string;
}): ReactNode {
  return (
    <>
      {/*
        * Строка внизу листа обязательна: чертёж уходит на производство и
        * клиенту, и оба должны видеть, где размеры сняты, а где приняты.
        */}
      <p className="mt-3 text-[10px] leading-snug">
        {pending.length > 0 ? (
          <span className="text-tape">
            Позиции, требующие уточнения на объекте: {pending.join('; ')}.
          </span>
        ) : (
          <span className="text-graphiteMw">Все размеры сняты на объекте.</span>
        )}
      </p>

      {notes?.trim() && (
        <p className="mt-1 whitespace-pre-wrap text-[10px] leading-snug text-graphiteMw">
          Примечания со слов клиента: {notes.trim()}
        </p>
      )}

      {/* Штамп */}
      <div className="mt-4 flex flex-wrap items-end justify-end gap-x-6 gap-y-1 border-t border-cyan/40 pt-2">
        <div className="mr-auto text-[10px] uppercase tracking-[0.14em] text-cyan">
          InteriorAI Studio
        </div>
        <Stamp label="Объект" value={title} />
        <Stamp label="Зона" value={zone} />
        <Stamp label="Замерщик" value={measuredBy} />
        <Stamp label="Дата" value={measuredAt} mono />
        <Stamp label="Вариант" value={variantTitle} />
        <Stamp label="Лист" value={sheetLabel} mono />
      </div>
    </>
  );
}

function Stamp({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.14em] text-graphiteMw">{label}</div>
      <div className={`text-[11px] ${mono ? 'mw-num' : ''}`}>{value}</div>
    </div>
  );
}
