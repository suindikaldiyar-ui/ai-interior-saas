'use client';

import { formatMoney } from '@/lib/millwork/estimate';
import type { Variant, VariantKey } from '@/types/millwork';

/**
 * Цена стоит прямо во вкладке варианта: мебельная компания продаёт деньгами,
 * и клиент должен видеть все три суммы сразу, не переключая ничего.
 */

type Props = {
  variants: Variant[];
  active: VariantKey;
  onChange: (key: VariantKey) => void;
};

export default function VariantTabs({ variants, active, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 border-b border-navyLine">
      {variants.map((variant) => {
        const on = variant.key === active;
        return (
          <button
            key={variant.key}
            type="button"
            onClick={() => onChange(variant.key)}
            aria-pressed={on}
            className={`mw-touch relative border-r border-navyLine px-2 py-2 text-left last:border-r-0 ${
              on ? 'bg-navy' : 'bg-transparent hover:bg-navy/60'
            }`}
          >
            <span
              className={`block text-[13px] ${
                on ? 'text-textMw' : 'text-graphiteMw'
              }`}
            >
              {variant.title}
            </span>
            {/* Жёлтый только как акцент: цифры на синем жёлтым не читаются. */}
            <span
              className={`mw-num block text-[17px] font-semibold leading-tight ${
                on ? 'text-textMw' : 'text-graphiteMw'
              }`}
            >
              {formatMoney(variant.estimate.total)} ₸
            </span>
            <span className="mt-0.5 block text-[13px] leading-tight text-graphiteMw">
              {variant.description}
            </span>
            {on && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-tape" />}
          </button>
        );
      })}
    </div>
  );
}
