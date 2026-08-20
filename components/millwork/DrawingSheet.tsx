'use client';

import type { ReactNode } from 'react';

/**
 * Лист чертежа: фон, мягкая тень на бетон, поля и штамп в правом нижнем углу.
 * Это единственная скевоморфная вольность в интерфейсе, и она заслужена —
 * лист печатают на A4 и вешают на стене объекта.
 */

type Props = {
  title: string;
  zone: string;
  measuredBy: string;
  measuredAt: string;
  variantTitle: string;
  children: ReactNode;
};

export default function DrawingSheet({
  title,
  zone,
  measuredBy,
  measuredAt,
  variantTitle,
  children,
}: Props) {
  return (
    <div className="mw-sheet mx-auto w-full max-w-4xl border border-blueprint/20 p-4 sm:p-6 print:border-0 print:shadow-none">
      <div>{children}</div>

      {/* Штамп */}
      <div className="mt-4 flex flex-wrap items-end justify-end gap-x-6 gap-y-1 border-t border-blueprint/30 pt-2">
        <div className="mr-auto text-[10px] uppercase tracking-[0.14em] text-graphiteMw">
          InteriorAI Studio
        </div>
        <Stamp label="Объект" value={title} />
        <Stamp label="Зона" value={zone} />
        <Stamp label="Замерщик" value={measuredBy} />
        <Stamp label="Дата" value={measuredAt} mono />
        <Stamp label="Вариант" value={variantTitle} />
      </div>
    </div>
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
