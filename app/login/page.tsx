'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * Вход по ссылке на почту.
 *
 * Паролей нет намеренно: замерщик открывает приложение в квартире, стоя,
 * с планшетом в одной руке. Вводить туда пароль неудобно, а восстанавливать
 * забытый — тем более. Одно поле и одна кнопка.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = supabaseBrowser();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError('Supabase не настроен: добавьте ключи в .env.local.');
      return;
    }

    setBusy(true);
    setError(null);

    /*
     * Куда вернуть после письма. Читаем из адреса, а не через useSearchParams:
     * хук заставил бы обернуть страницу в Suspense ради одной строки.
     */
    const requested = new URLSearchParams(window.location.search).get('next');
    const next = requested?.startsWith('/') ? requested : '/projects';

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setBusy(false);
    if (authError) setError(authError.message);
    else setSent(true);
  };

  return (
    <main className="mw-root flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="mw-label mb-1">InteriorAI Studio</p>
        <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.02em]">
          Вход в кабинет
        </h1>
        <p className="mb-5 text-[13px] text-graphiteMw">
          Пришлём ссылку на почту — пароль не нужен.
        </p>

        {sent ? (
          <div className="border border-cyan/50 bg-sheet p-4">
            <p className="mb-1 text-[13px]">Ссылка отправлена на {email}.</p>
            <p className="text-[12px] text-graphiteMw">
              Откройте письмо на этом же устройстве. Ссылка действует один раз.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-3 text-[12px] text-cyanBright underline"
            >
              Отправить ещё раз
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="border border-navyLine bg-sheet p-4">
            <label className="block">
              <span className="mw-label">Рабочая почта</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.kz"
                className="mw-touch mt-1 w-full border border-navyLine bg-navyDeep px-2 text-[15px] outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="mw-touch mt-3 w-full border border-cyanBright bg-cyanBright px-3 text-[12px] uppercase tracking-[0.1em] text-navyDeep disabled:opacity-40"
            >
              {busy ? 'Отправляем…' : 'Прислать ссылку для входа'}
            </button>

            {error && <p className="mt-3 text-[12px] text-alert">{error}</p>}
          </form>
        )}

        <p className="mt-4 text-[12px] text-graphiteMw">
          Посмотреть без входа —{' '}
          <Link href="/demo" className="text-cyanBright underline">
            демонстрация
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
