'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Первый вход: у пользователя ещё нет компании. Он и становится владельцем —
 * каталог, цены и сотрудники дальше идут от него.
 */
export default function OrgBootstrap() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch('/api/orgs/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, city, phone }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? 'Не удалось создать компанию.');
      return;
    }
    router.refresh();
  };

  return (
    <main className="mw-root flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-navyLine bg-sheet p-4">
        <p className="mw-label mb-1">Первый вход</p>
        <h1 className="mb-1 text-[20px] font-semibold tracking-[-0.02em]">
          Создайте компанию
        </h1>
        <p className="mb-4 text-[12px] text-graphiteMw">
          Каталог, объекты и доступы сотрудников привязаны к компании.
          Вы становитесь её владельцем.
        </p>

        <label className="mb-3 block">
          <span className="mw-label">Название</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Decofasa"
            className="mw-touch mt-1 w-full border border-navyLine bg-navyDeep px-2 text-[15px] outline-none"
          />
        </label>

        <label className="mb-3 block">
          <span className="mw-label">Город</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Алматы"
            className="mw-touch mt-1 w-full border border-navyLine bg-navyDeep px-2 text-[15px] outline-none"
          />
        </label>

        <label className="mb-3 block">
          <span className="mw-label">Телефон</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7"
            className="mw-num mw-touch mt-1 w-full border border-navyLine bg-navyDeep px-2 text-[15px] outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="mw-label">Слаг (поддомен)</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="decofasa"
            className="mw-num mw-touch mt-1 w-full border border-navyLine bg-navyDeep px-2 text-[14px] outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mw-touch w-full border border-cyanBright bg-cyanBright px-3 text-[12px] uppercase tracking-[0.1em] text-navyDeep disabled:opacity-40"
        >
          {busy ? 'Создаём…' : 'Создать компанию'}
        </button>

        {error && <p className="mt-3 text-[12px] text-alert">{error}</p>}
      </form>
    </main>
  );
}
