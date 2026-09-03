'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  SHEET_MARGIN_MM,
  SHEET_SIZE,
  VIEW_CAPTION_MM,
  paginate,
  scaleLabel,
  sheetNumber,
  type SheetFormat,
  type SheetView,
} from '@/lib/millwork/sheet';

/**
 * КОМПОНОВКА ЛИСТА.
 *
 * Проектировщик работает не с одним видом, а с ЛИСТОМ: фасад, разрезы, план
 * и аксонометрия рядом, у каждого своя подпись и свой масштаб. По одному
 * виду за раз мебель не собирают — приходится держать в голове то, что
 * должно лежать перед глазами.
 *
 * Масштаб здесь НАСТОЯЩИЙ: ширина поля вида задана в миллиметрах бумаги,
 * поэтому при 1:25 тысяча миллиметров мебели занимает сорок миллиметров
 * листа и снимается линейкой. Из-за этого же виды не ужимаются, чтобы
 * «влезло»: что не помещается, уходит на следующий лист со своим номером.
 */

export type SheetViewNode = SheetView & {
  /** Масштаб вида: подпись «1:25» и деление размеров. */
  scaleDen: number;
  render: ReactNode;
};

type Props = {
  format: SheetFormat;
  views: SheetViewNode[];
  /** Примечания и штамп: повторяются на каждом листе. */
  footer: (page: { index: number; total: number; label: string }) => ReactNode;
};

export default function SheetLayout({ format, views, footer }: Props) {
  const pages = paginate(views, format);
  const byId = new Map(views.map((view) => [view.id, view]));
  const size = SHEET_SIZE[format];
  const fieldWidthMm = size.width - SHEET_MARGIN_MM * 2;

  /*
   * НА БУМАГЕ ЛИСТ НАТУРАЛЬНЫЙ, НА ЭКРАНЕ — ВПИСАННЫЙ.
   *
   * Поле A3 это 400 мм, то есть полтора экрана планшета: показывать его
   * в натуре значит заставить замерщика возить лист вбок при клиенте.
   * Поэтому на экране лист уменьшается целиком, одним преобразованием —
   * масштаб внутри от этого не врёт, он остаётся отношением, а печать
   * преобразование снимает и печатает натуру.
   */
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [innerHeight, setInnerHeight] = useState(0);

  useEffect(() => {
    const measure = () => {
      // Пикселей в миллиметре меряем сами: у браузера и монитора свои
      // представления об этом, и константа 3.78 врёт на половине машин.
      const pxPerMm = (probe.current?.getBoundingClientRect().width ?? 378) / 100;
      const need = fieldWidthMm * pxPerMm;
      const have = wrap.current?.clientWidth ?? need;
      setFit(need > 0 ? Math.min(1, have / need) : 1);
      /*
       * Уменьшенный лист занимает в потоке прежнюю высоту: под ним
       * оставалась бы пустота в треть экрана. Поэтому высоту обёртки
       * ставим сами — по настоящей высоте содержимого.
       */
      setInnerHeight(inner.current?.scrollHeight ?? 0);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    if (wrap.current) observer.observe(wrap.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, [fieldWidthMm, views]);

  return (
    <>
      {/*
        * Размер страницы задаётся здесь, а не в глобальных стилях: формат
        * выбирается по составу, и печатать короткий ряд на A3 значит тратить
        * бумагу компании.
        */}
      <style>{`@media print { @page { size: ${format} landscape; margin: ${SHEET_MARGIN_MM}mm; } }`}</style>

      {/* Линейка на 100 мм: по ней меряется, сколько пикселей в миллиметре. */}
      <div ref={probe} aria-hidden className="mw-sheet-probe" style={{ width: '100mm' }} />

      <div
        ref={wrap}
        className="mw-sheet-fit"
        style={{ height: fit < 1 && innerHeight > 0 ? `${innerHeight * fit}px` : undefined }}
      >
      <div
        ref={inner}
        style={{ width: `${fieldWidthMm}mm`, transform: `scale(${fit})`, transformOrigin: 'top left' }}
      >
      {pages.map((page, index) => (
        <section
          key={index}
          data-sheet-page={index + 1}
          className="mw-sheet-page"
          style={{
            width: `${fieldWidthMm}mm`,
            // Второй лист начинается с новой страницы, а не подпирает первый.
            breakBefore: index === 0 ? 'auto' : 'page',
          }}
        >
          <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
            {page.views.map((view) => {
              const node = byId.get(view.id);
              if (!node) return null;

              return (
                <figure
                  key={view.id}
                  data-view={view.id}
                  style={{ width: `${view.widthMm}mm`, maxWidth: '100%', margin: 0 }}
                >
                  {/*
                    * Подпись и масштаб — обязательная часть вида. Чертёж без
                    * масштаба читается как картинка, и мерить по нему нельзя.
                    */}
                  <figcaption
                    className="mb-1 flex items-baseline gap-2 text-[10px] uppercase tracking-[0.12em]"
                    style={{ minHeight: `${VIEW_CAPTION_MM}mm` }}
                  >
                    <span>{node.title}</span>
                    <span className="mw-num text-graphiteMw">{scaleLabel(node.scaleDen)}</span>
                  </figcaption>
                  {node.render}
                </figure>
              );
            })}
          </div>

          {footer({ index, total: pages.length, label: sheetNumber(index, pages.length) })}
        </section>
      ))}
      </div>
      </div>
    </>
  );
}
