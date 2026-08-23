'use client';

import { useEffect, useRef, useState } from 'react';
import { dictate, speechSupported, type DictationHandle } from '@/lib/speech';

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
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(false);
  const handle = useRef<DictationHandle | null>(null);

  // Наличие распознавания проверяем после монтирования: на сервере окна нет.
  useEffect(() => setVoice(speechSupported()), []);

  const send = async (value = text) => {
    const command = value.trim();
    if (!command || busy) return;
    setText('');
    await onSubmit(command);
  };

  /*
   * Сказанное сразу уходит в работу: клиент произносит «мойку ближе к окну»,
   * замерщик повторяет в микрофон и мойка переезжает при нём. Промежуточный
   * шаг «проверьте текст и нажмите» убивает весь эффект.
   */
  const toggleVoice = () => {
    if (listening) {
      handle.current?.stop();
      return;
    }
    handle.current = dictate(
      (heard) => {
        setText(heard);
        void send(heard);
      },
      () => setListening(false),
    );
    setListening(handle.current !== null);
  };

  return (
    <div className="mw-panel">
      {lastReply && <p className="mb-3 text-[13px] text-graphiteMw">{lastReply}</p>}

      <div className="mb-3 flex flex-wrap gap-2">
        {HINTS.map((hint, i) => (
          <button
            key={hint}
            type="button"
            disabled={busy}
            onClick={() => void onSubmit(hint)}
            className={`mw-touch rounded-[var(--r-control)] bg-sheet px-3 text-[13px] text-graphiteMw hover:text-textMw disabled:opacity-40 ${
              i > 2 ? 'hidden sm:inline-flex' : ''
            }`}
          >
            {hint}
          </button>
        ))}
      </div>

      {/* На телефоне поле занимает строку целиком, кнопки уходят под него. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          disabled={busy}
          placeholder="убери пенал"
          className="mw-field w-full disabled:opacity-50 sm:flex-1"
        />
        {voice && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={busy}
            aria-pressed={listening}
            aria-label={listening ? 'Остановить запись' : 'Сказать команду'}
            className={`mw-btn ${listening ? 'mw-btn-ghost text-alert' : 'mw-btn-ghost'}`}
          >
            {listening ? '● Слушаю' : '🎤'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          className="mw-btn mw-btn-primary"
        >
          {busy ? 'Считаем' : 'Применить'}
        </button>
      </div>
    </div>
  );
}
