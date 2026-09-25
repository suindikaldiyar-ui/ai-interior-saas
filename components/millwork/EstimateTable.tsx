'use client';

import { UNIT_LABEL_MW, formatMoney, lineAmountText, totalCaption } from '@/lib/millwork/estimate';
import type { Estimate } from '@/types/millwork';

/**
 * Смета всегда на экране. Снял галочку — итог пересчитался при клиенте,
 * это главный момент продажи. Никаких «показать смету» по кнопке.
 */

type Props = {
  estimate: Estimate;
  disabledKeys: string[];
  onToggle: (key: string) => void;
};

export default function EstimateTable({ estimate, disabledKeys, onToggle }: Props) {
  const disabled = new Set(disabledKeys);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mw-label border-b border-navyLine px-3 py-2">Смета</div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <tbody>
            {estimate.lines.map((line) => {
              const off = disabled.has(line.key);
              return (
                <tr
                  key={line.key}
                  className={`border-b border-navyLine/60 ${off ? 'opacity-40' : ''}`}
                >
                  <td className="w-8 px-2 py-1.5 align-top">
                    <input
                      type="checkbox"
                      checked={!off}
                      onChange={() => onToggle(line.key)}
                      aria-label={line.title}
                      className="mt-0.5 h-4 w-4 rounded-none accent-[var(--cyan-bright)]"
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <div className="text-[12px] leading-tight">{line.title}</div>
                    <div className="mw-num text-[10px] text-graphiteMw">
                      {line.quantity} {UNIT_LABEL_MW[line.unit]}
                      {line.rate > 0 && ` × ${formatMoney(line.rate)}`}
                      {line.missingRate && (
                        <span className="ml-1 text-alert">ставки нет в каталоге</span>
                      )}
                    </div>
                  </td>
                  {/* «Цена не задана» вместо «0»: ноль здесь не бесплатно, а неизвестно. */}
                  <td
                    className={`mw-num px-2 py-1.5 text-right text-[12px] align-top ${
                      line.priceUnset ? 'text-alert' : ''
                    }`}
                    data-line-amount={line.key}
                  >
                    {line.priceUnset ? lineAmountText(line) : formatMoney(line.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-baseline justify-between border-t-2 border-cyan px-3 py-2">
        <span className="mw-label">
          {/* Подпись у самой суммы: её и увидит клиент, а не сноску сверху. */}
          {totalCaption(estimate)}
        </span>
        <span className="mw-num text-[20px] font-semibold">{formatMoney(estimate.total)} ₸</span>
      </div>
    </div>
  );
}
