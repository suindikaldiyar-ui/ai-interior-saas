'use client';

import { useEffect } from 'react';
import EstimateTable from './EstimateTable';
import { formatMoney } from '@/lib/millwork/estimate';
import type { Estimate } from '@/types/millwork';

/**
 * Смета не висит на экране постоянно.
 *
 * Замерщику она нужна в двух местах разговора: назвать сумму и снять
 * галочку при клиенте. Всё остальное время это двадцать строк, которые
 * съедают треть планшета. Поэтому итог живёт строкой внизу, а таблица
 * открывается тапом и закрывается тапом мимо.
 */

type Props = {
  estimate: Estimate;
  variantTitle: string;
  disabledKeys: string[];
  onToggle: (key: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preliminary?: boolean;
};

export default function EstimateSheet({
  estimate,
  variantTitle,
  disabledKeys,
  onToggle,
  open,
  onOpenChange,
  preliminary,
}: Props) {
  // Esc закрывает — привычка, которой не надо учить.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="mw-touch flex w-full items-center gap-3 rounded-[var(--r-control)] bg-navy px-4 text-left"
      >
        <span className="hidden truncate text-[13px] text-graphiteMw sm:block">
          {variantTitle}
        </span>
        <span
          key={estimate.total}
          className="mw-num mw-value-flash whitespace-nowrap text-[22px] font-semibold"
        >
          {formatMoney(estimate.total)} ₸
        </span>
        {preliminary && (
          <span className="text-[13px] text-tape">предварительно</span>
        )}
        <span className="ml-auto text-[13px] text-cyan">
          {open ? 'свернуть' : 'подробнее'}
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Закрыть смету"
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-40 bg-navyDeep/60 print:hidden"
          />
          <section className="fixed inset-x-0 bottom-0 z-50 max-h-[72vh] overflow-hidden rounded-t-[var(--r-panel)] bg-navy shadow-[0_-8px_24px_rgba(0,0,0,0.35)] print:hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-[17px] font-medium">Смета · {variantTitle}</span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="mw-touch mw-btn mw-btn-ghost ml-auto"
              >
                Закрыть
              </button>
            </div>

            {preliminary && (
              <p className="px-4 pb-2 text-[13px] leading-snug text-tape">
                Смета предварительная: часть размеров принята по умолчанию.
                Точная — когда все величины сняты на объекте.
              </p>
            )}

            <div className="max-h-[52vh] overflow-y-auto">
              <EstimateTable
                estimate={{ ...estimate, preliminary }}
                disabledKeys={disabledKeys}
                onToggle={onToggle}
              />
            </div>
          </section>
        </>
      )}
    </>
  );
}
