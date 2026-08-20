'use client';

import { useState } from 'react';

/**
 * Командная строка внизу — там, где большой палец на планшете.
 * Подписи от лица системы, а не человека: «Пенал удалён», не «Я удалил пенал».
 */

type Props = {
  onSubmit: (text: string) => Promise<void> | void;
  busy: boolean;
  lastReply: string | null;
};

const HINTS = [
  'убери пенал',
  'поставь посудомойку 45 рядом с мойкой',
  'сделай ящики вместо дверцы во втором модуле',
  'подними верхние до потолка',
  'фурнитуру Blum',
];

export default function CommandBar({ onSubmit, busy, lastReply }: Props) {
  const [text, setText] = useState('');

  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setText('');
    await onSubmit(value);
  };

  return (
    <div className="border-t border-blueprint/25 bg-concrete px-3 py-2">
      {lastReply && (
        <p className="mb-1.5 text-[12px] text-graphiteMw">{lastReply}</p>
      )}

      <div className="mb-1.5 flex flex-wrap gap-1">
        {HINTS.map((hint) => (
          <button
            key={hint}
            type="button"
            disabled={busy}
            onClick={() => void onSubmit(hint)}
            className="border border-blueprint/30 px-1.5 py-1 text-[10px] text-graphiteMw hover:border-blueprint hover:text-ink disabled:opacity-40"
          >
            {hint}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span aria-hidden className="mw-num text-[14px] text-blueprint">
          ›
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          disabled={busy}
          placeholder="убери пенал"
          className="mw-touch flex-1 border border-blueprint/30 bg-sheet px-2 text-[13px] outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          className="mw-touch border border-blueprint bg-blueprint px-3 text-[11px] uppercase tracking-[0.1em] text-sheet disabled:opacity-40"
        >
          {busy ? 'Считаем' : 'Применить'}
        </button>
      </div>
    </div>
  );
}
