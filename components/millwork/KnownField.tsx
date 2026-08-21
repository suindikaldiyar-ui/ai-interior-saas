'use client';

import { useEffect, useRef, useState } from 'react';
import { measured, type Known } from '@/types/survey';

/**
 * Поле величины, которая может быть не замерена.
 *
 * Пустое поле — это «не замерено», а не ноль. Принятое по умолчанию значение
 * выглядит иначе: приглушённый цвет, пунктирная подчёркивающая линия и
 * подпись, откуда взялось число. Клиент смотрит в этот же экран и обязан
 * видеть разницу между «мы это померили» и «мы это предположили».
 */

type Props = {
  label: string;
  value: Known<number>;
  onChange: (next: Known<number>) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  /** Enter переводит на следующее поле — руки заняты рулеткой. */
  autoFocus?: boolean;
  suffix?: string;
};

export default function KnownField({
  label,
  value,
  onChange,
  placeholder = 'не замерено',
  min = 0,
  max = 100000,
  autoFocus,
  suffix = 'мм',
}: Props) {
  const [draft, setDraft] = useState(
    value.state === 'unknown' ? '' : String(value.value),
  );
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value.state === 'unknown' ? '' : String(value.value));
  }, [value]);

  const commit = (raw: string) => {
    const text = raw.trim();
    if (text === '') {
      // Пустое поле возвращает величину в «не замерено» — молча не подставляем.
      onChange({ state: 'unknown' });
      return;
    }

    const parsed = Math.round(Number(text));
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(value.state === 'unknown' ? '' : String(value.value));
      return;
    }
    onChange(measured(parsed));
  };

  const assumedValue = value.state === 'assumed';

  return (
    <label className="block">
      <span className="mw-label">{label}</span>
      <span className="relative mt-1 flex items-center">
        <input
          ref={input}
          type="number"
          inputMode="numeric"
          step={1}
          min={min}
          max={max}
          autoFocus={autoFocus}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);

            // Следующее поле — по порядку в форме, без мыши.
            const fields = Array.from(
              (e.target as HTMLInputElement)
                .closest('form, div[data-survey-step]')
                ?.querySelectorAll<HTMLInputElement>('input, select') ?? [],
            );
            const index = fields.indexOf(e.target as HTMLInputElement);
            fields[index + 1]?.focus();
          }}
          className={`mw-num mw-touch w-full border bg-field px-2 text-[15px] outline-none ${
            assumedValue
              ? 'border-dashed border-tape/70 text-graphiteMw'
              : value.state === 'unknown'
                ? 'border-blueprint/30 placeholder:text-graphiteMw/60'
                : 'border-blueprint/50'
          }`}
        />
        <span className="mw-num pointer-events-none absolute right-2 text-[11px] text-graphiteMw">
          {suffix}
        </span>
      </span>

      {assumedValue && (
        <span className="mt-0.5 block text-[10px] leading-tight text-tape">
          принято по умолчанию: {value.basis}
        </span>
      )}
    </label>
  );
}
