'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Первый вход: у пользователя ещё нет организации. */
export default function OrgBootstrap() {
  const router = useRouter();
  const [name, setName] = useState('');
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
      body: JSON.stringify({ name, slug }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? 'Не удалось создать организацию.');
      return;
    }
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-lineStrong bg-white p-5">
        <p className="micro-label mb-1">Первый вход</p>
        <h1 className="mb-3 text-[18px] font-semibold tracking-tight">Создайте компанию</h1>
        <p className="mb-4 text-[12px] text-graphiteSoft">
          Каталог, проекты и доступы привязаны к компании.
        </p>

        <label className="mb-3 block">
          <span className="micro-label">Название</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Decofasa"
            className="mt-1 w-full border border-lineStrong bg-white px-2 py-1.5 text-[13px] outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="micro-label">Слаг (поддомен)</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="decofasa"
            className="mt-1 w-full border border-lineStrong bg-white px-2 py-1.5 font-mono text-[13px] outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full border border-patina bg-patina px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-paper disabled:opacity-40"
        >
          {busy ? 'Создаём…' : 'Создать'}
        </button>

        {error && <p className="mt-3 text-[12px] text-ochre">{error}</p>}
      </form>
    </main>
  );
}
