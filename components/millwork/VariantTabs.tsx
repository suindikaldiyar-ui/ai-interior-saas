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
    <div className="grid grid-cols-3 border-b border-blueprint/25">
      {variants.map((variant) => {
        const on = variant.key === active;
        return (
          <button
            key={variant.key}
            type="button"
            onClick={() => onChange(variant.key)}
            aria-pressed={on}
            className={`mw-touch border-r border-blueprint/20 px-2 py-2 text-left last:border-r-0 ${
              on ? 'bg-tape' : 'bg-transparent hover:bg-concreteDeep'
            }`}
          >
            <span className="block text-[11px] uppercase tracking-[0.14em]">{variant.title}</span>
            <span className="mw-num block text-[17px] font-semibold leading-tight">
              {formatMoney(variant.estimate.total)} ₸
            </span>
            <span className="mt-0.5 block text-[10px] leading-tight text-graphiteMw">
              {variant.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
