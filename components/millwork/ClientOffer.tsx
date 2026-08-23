'use client';

import { useState } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import BeforeAfter from './BeforeAfter';
import ElevationDrawing from './ElevationDrawing';
import { UNIT_LABEL_MW, formatMoney } from '@/lib/millwork/estimate';
import type { Org } from '@/types/catalog';
import type { Estimate, Run } from '@/types/millwork';

/**
 * Что видит клиент по ссылке.
 *
 * Ровно то, что ему показали на встрече: тот же чертёж, тот же состав, та же
 * сумма. Здесь ничего не пересчитывается — цены взяты снимком на момент
 * расчёта, иначе изменившийся прайс развернул бы подписанное предложение.
 */

type Props = {
  token: string;
  org: Org | null;
  clientName: string;
  title: string;
  zone: string;
  run: Run;
  /** Название выбранной комплектации — подпись правой половины сравнения. */
  variantTitle: string;
  estimate: Estimate;
  disabledKeys: string[];
  approved: boolean;
  /** Что осталось уточнить на объекте. Клиент видит это до подписи. */
  pending?: string[];
  preliminary?: boolean;
  /** Фотография помещения и рендер выбранной комплектации. */
  photoUrl?: string | null;
  renderUrl?: string | null;
};

export default function ClientOffer({
  token,
  org,
  clientName,
  title,
  zone,
  run,
  variantTitle,
  estimate,
  disabledKeys,
  approved,
  pending = [],
  preliminary = false,
  photoUrl = null,
  renderUrl = null,
}: Props) {
  const [liked, setLiked] = useState(approved);
  const [busy, setBusy] = useState(false);
  const off = new Set(disabledKeys);
  const lines = estimate.lines.filter((l) => !off.has(l.key));

  const approve = async () => {
    setBusy(true);
    setLiked(true);
    await fetch('/api/projects/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Наружу уходит только токен: ни org_id, ни id проекта клиент не знает.
      body: JSON.stringify({ token, approved: true }),
    }).catch(() => undefined);
    setBusy(false);
  };

  return (
    <main className="mw-root min-h-screen">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-navyLine px-4 py-3">
        <span className="text-[15px] font-semibold tracking-[-0.02em]">
          {org?.name ?? 'InteriorAI Studio'}
        </span>
        <span className="text-[13px]">
          {title} · {zone}
        </span>
        {clientName && <span className="mw-label ml-auto">Для {clientName}</span>}
        <ThemeToggle className={clientName ? '' : 'ml-auto'} />
      </header>

      <section className="border-b border-navyLine px-4 py-4">
        <p className="mw-label mb-1">Ваша кухня</p>
        <p className="mw-num mw-display">
          {formatMoney(estimate.total)} ₸
        </p>
        <p className="mt-1 text-[13px] text-graphiteMw">
          Цены зафиксированы на {estimate.calculatedAt}. Ряд {run.lengthMm} мм,
          модулей {run.modules.length}.
        </p>
        {preliminary && (
          <p className="mt-1 text-[13px] text-tape">
            Смета предварительная: часть размеров принята по умолчанию.
          </p>
        )}
        <p className="mt-1 text-[13px] leading-snug">
          {pending.length > 0 ? (
            <span className="text-tape">
              Позиции, требующие уточнения на объекте: {pending.join('; ')}.
            </span>
          ) : (
            <span className="text-graphiteMw">Все размеры сняты на объекте.</span>
          )}
        </p>
      </section>

      {photoUrl && (
        <section className="border-b border-navyLine px-4 py-4">
          <p className="mw-label mb-2">Ваша квартира и ваша кухня</p>
          <BeforeAfter
            photo={photoUrl}
            render={renderUrl}
            title={variantTitle}
            emptyHint="Визуализация ещё готовится"
          />
        </section>
      )}

      <section className="border-b border-navyLine px-4 py-4">
        <ElevationDrawing run={run} />
      </section>

      <section className="px-4 py-4">
        <p className="mw-label mb-2">Что входит</p>
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-b border-navyLine/60">
                <td className="py-1.5 pr-2">
                  <div className="text-[13px] leading-tight">{line.title}</div>
                  <div className="mw-num text-[13px] text-graphiteMw">
                    {line.quantity} {UNIT_LABEL_MW[line.unit]}
                  </div>
                </td>
                <td className="mw-num py-1.5 text-right text-[13px]">
                  {formatMoney(line.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={approve}
            disabled={busy || liked}
            className="mw-btn mw-btn-lg mw-btn-primary"
          >
            {liked ? 'Вариант согласован' : 'Мне подходит'}
          </button>
          {org?.phone && (
            <a href={`tel:${org.phone}`} className="text-[13px] text-cyanBright underline">
              Позвонить: {org.phone}
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
