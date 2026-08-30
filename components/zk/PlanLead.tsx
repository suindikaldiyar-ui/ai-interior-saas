'use client';

import { useState } from 'react';

/**
 * «Хочу такой проект».
 *
 * Единственное обязательное поле — телефон: по нему перезванивают. Имя
 * помогает разговору, но требовать его — терять заявки.
 *
 * Заявка сохраняется в базу ДО отправки в Telegram: упавший телеграм не
 * должен стоить компании живого человека, оставившего номер.
 */

type Props = {
  planId: string;
  /** Планировка ещё не обмерена — обещаем разговор, а не цену. */
  measured: boolean;
};

export default function PlanLead({ planId, measured }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/complexes/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, name, phone, comment }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) setSent(true);
      else setError(data.error ?? 'Заявка не отправилась. Позвоните нам.');
    } catch {
      setError('Сети нет. Попробуйте ещё раз или позвоните нам.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="mw-panel">
        <p className="text-[17px] leading-snug">Спасибо, заявка у нас.</p>
        <p className="mt-1 text-[15px] leading-snug text-graphiteMw">
          Перезвоним и договоримся о замере — уточним размеры именно вашей
          квартиры.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mw-panel">
      <p className="text-[17px] font-medium leading-tight">
        {measured ? 'Хочу такой проект' : 'Проект под эту планировку готовим'}
      </p>
      <p className="mb-3 mt-1 text-[13px] leading-snug text-graphiteMw">
        {measured
          ? 'Оставьте номер — перезвоним, обсудим материалы и запишемся на замер.'
          : 'Оставьте номер — покажем первыми, как только он будет готов.'}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mw-label">Как вас зовут</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="mw-field mt-1"
          />
        </label>

        <label className="block">
          <span className="mw-label">Телефон</span>
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7"
            className="mw-num mw-field mt-1"
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mw-label">Пожелания</span>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Кухня и шкаф в спальню"
          className="mw-field mt-1"
        />
      </label>

      <button
        type="submit"
        disabled={busy || phone.trim().length < 6}
        className="mw-btn mw-btn-lg mw-btn-primary mt-3 w-full"
      >
        {busy ? 'Отправляем…' : measured ? 'Хочу такой проект' : 'Сообщите мне'}
      </button>

      {error && <p className="mt-2 text-[13px] text-alert">{error}</p>}
    </form>
  );
}
