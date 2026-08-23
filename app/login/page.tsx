'use client';

import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
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
        <div className="mb-1 flex items-center justify-between">
          <p className="mw-label">InteriorAI Studio</p>
          <ThemeToggle />
        </div>
        <h1 className="mw-title mb-1">Вход в кабинет</h1>
        <p className="mb-5 text-[13px] text-graphiteMw">
          Пришлём ссылку на почту — пароль не нужен.
        </p>

        {sent ? (
          <div className="mw-panel">
            <p className="text-[15px] leading-snug">
              Ссылка отправлена на {email}. Откройте письмо на этом же устройстве.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mw-btn mw-btn-ghost mt-3"
            >
              Отправить ещё раз
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mw-panel">
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
                className="mw-field mt-2"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="mw-btn mw-btn-lg mw-btn-primary mt-3 w-full"
            >
              {busy ? 'Отправляем…' : 'Прислать ссылку для входа'}
            </button>

            {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
          </form>
        )}

        <Link href="/demo" className="mw-btn mw-btn-ghost mt-4 w-full">
          Посмотреть демонстрацию без входа
        </Link>
      </div>
    </main>
  );
}
