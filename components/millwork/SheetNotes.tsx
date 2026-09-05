'use client';

import type { ReactNode } from 'react';

/**
 * ПРИМЕЧАНИЯ И ШТАМП.
 *
 * Примечания — не формальность, а защита компании на монтаже. «Размеры
 * уточняются после чистовой отделки стен» — это та строка, которая решает
 * спор о том, кто платит за переделку, когда штукатур увёл стену на два
 * сантиметра. Поэтому список стоит на КАЖДОМ листе и не сворачивается.
 *
 * Штамп заполняется из объекта и организации: логотип, телефон, кто
 * разработал, кто заказчик, какая позиция и какой лист по счёту.
 */

/**
 * Девять пунктов, которые мебельная компания пишет на каждом листе.
 *
 * Порядок отраслевой: сначала единицы измерения, потом уточнения на объекте,
 * потом ответственность сторон, в конце — согласование материалов.
 */
export const SHEET_NOTES: string[] = [
  'Все размеры даны в миллиметрах.',
  'Размеры, отмеченные *, уточняются по месту.',
  'Размеры корпусной и встраиваемой мебели уточняются после возведения перегородок и чистовой отделки стен.',
  'Производитель изготавливает мебель на основании собственных замеров.',
  'Направление волокон шпона — вдоль длинной стороны детали, если не указано иное.',
  'Образцы материалов и тип фурнитуры согласовать с заказчиком до запуска в производство.',
  'Мебель устанавливается после завершения отделочных работ.',
  'Подключение и монтаж подсветки выполняет производитель изделий.',
  'Размеры под встраиваемую технику уточняются по паспорту прибора.',
];

export type StampFields = {
  /** Объект: адрес или название квартиры. */
  object: string;
  /** Что за изделие: «Кухонный гарнитур». */
  product: string;
  /** Номер позиции по объекту: «МИ-поз.1». */
  position: string;
  /** Кто разработал — замерщик. */
  author: string;
  /** Кто проверил. Пусто — строка остаётся под подпись. */
  checkedBy?: string;
  client?: string;
  date: string;
  /** «1:25» — масштаб основных видов листа. */
  scale: string;
  sheet: string;
  company?: string;
  phone?: string;
  logoUrl?: string | null;
};

type Props = {
  fields: StampFields;
  /** Что осталось незамеренным — обязательная строка внизу листа. */
  pending?: string[];
  /** Пожелания со слов клиента. */
  notes?: string;
  /**
   * Блок условных обозначений: образцы заливок и материалы каталога.
   * Стоит РЯДОМ с примечаниями и повторяется на каждом листе, как и они.
   */
  children?: ReactNode;
};

export default function SheetNotes({ fields, pending = [], notes, children }: Props) {
  return (
    <div className="mt-4">
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      {/* ── Примечания ── */}
      <div className="min-w-[52%] flex-1">
        <div className="mb-1 text-[9px] uppercase tracking-[0.14em] text-graphiteMw">
          Примечания
        </div>
        <ol className="grid gap-[2px] text-[9px] leading-[1.35]">
          {SHEET_NOTES.map((note, i) => (
            <li key={note} className="flex gap-2">
              <span className="mw-num w-4 shrink-0 text-right">{i + 1}.</span>
              <span>{note}</span>
            </li>
          ))}

          {/*
            * Позиции с допущениями называются ПОИМЁННО: «уточнить по месту»
            * без списка — это фраза, за которой на монтаже никто не следит.
            */}
          {pending.length > 0 && (
            <li className="flex gap-2 text-tape">
              <span className="mw-num w-4 shrink-0 text-right">{SHEET_NOTES.length + 1}.</span>
              <span>Позиции, требующие уточнения на объекте: {pending.join('; ')}.</span>
            </li>
          )}

          {notes?.trim() && (
            <li className="flex gap-2 text-graphiteMw">
              <span className="mw-num w-4 shrink-0 text-right">
                {SHEET_NOTES.length + (pending.length > 0 ? 2 : 1)}.
              </span>
              <span>Со слов заказчика: {notes.trim()}</span>
            </li>
          )}
        </ol>
      </div>

      {/* ── Штамп ── */}
      <div className="min-w-[260px] flex-1 border-t border-cyan/40 pt-2">
        <div className="flex items-start gap-3">
          {fields.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fields.logoUrl} alt="" className="h-6 w-auto" />
          ) : (
            <div className="text-[10px] uppercase tracking-[0.14em] text-cyan">
              {fields.company ?? 'InteriorAI Studio'}
            </div>
          )}
          <div className="ml-auto text-right text-[9px] leading-tight text-graphiteMw">
            {fields.company && fields.logoUrl && <div>{fields.company}</div>}
            {fields.phone && <div className="mw-num">{fields.phone}</div>}
          </div>
        </div>

        <table className="mt-2 w-full text-[9px] leading-tight">
          <tbody>
            <StampRow label="Разраб." value={fields.author} />
            {/* Строка проверяющего остаётся пустой под подпись: так лист
                и уходит на согласование. */}
            <StampRow label="Проверил" value={fields.checkedBy ?? '—'} />
            <StampRow label="Заказчик" value={fields.client ?? '—'} />
            <StampRow label="Объект" value={fields.object} />
            <StampRow label="Изделие" value={`${fields.product} · ${fields.position}`} />
            <StampRow label="Дата" value={fields.date} mono />
            <StampRow label="Масштаб" value={fields.scale} mono />
            <StampRow label="Лист" value={fields.sheet} mono />
          </tbody>
        </table>
      </div>
    </div>

      {children}
    </div>
  );
}

function StampRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr>
      <td className="w-[70px] py-[1px] pr-2 align-top uppercase tracking-[0.1em] text-graphiteMw">
        {label}
      </td>
      <td className={`py-[1px] align-top ${mono ? 'mw-num' : ''}`}>{value}</td>
    </tr>
  );
}
