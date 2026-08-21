'use client';

import type { ReactNode } from 'react';

/**
 * Лист чертежа — синька: тёмно-синее поле, светлые линии, штамп в правом
 * нижнем углу белым по синему. При печати инвертируется в обычный чертёж:
 * лист вешают на стене объекта, и там нужен белый фон с чёрными линиями.
 */

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
  children: ReactNode;
};

export default function DrawingSheet({
  title,
  zone,
  measuredBy,
  measuredAt,
  variantTitle,
  pending = [],
  notes,
  children,
}: Props) {
  return (
    <div className="mw-sheet mx-auto w-full max-w-4xl p-4 sm:p-6 print:border-0 print:shadow-none">
      <div>{children}</div>

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
