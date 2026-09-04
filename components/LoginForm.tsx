'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * Форма входа: одно поле и одна кнопка.
 *
 * Клиентская часть страницы входа. Бренд компании рисует серверный
 * компонент выше — иначе логотип пришлось бы тянуть запросом из браузера,
 * и первый экран мигал бы платформенным.
 */
export default function LoginForm() {
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

  if (sent) {
    return (
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
    );
  }

  return (
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
  );
}
