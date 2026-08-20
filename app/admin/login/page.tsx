'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = supabaseBrowser();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setMessage('Supabase не настроен: добавьте ключи в .env.local.');
      return;
    }
    setBusy(true);
    setMessage(null);

    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }
    if (mode === 'signup') {
      setMessage('Аккаунт создан. Если включено подтверждение почты — проверьте ящик.');
      return;
    }
    router.push('/admin/catalog');
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-lineStrong bg-white p-5">
        <p className="micro-label mb-1">InteriorAI Studio</p>
        <h1 className="mb-4 text-[18px] font-semibold tracking-tight">
          {mode === 'signin' ? 'Вход в кабинет' : 'Регистрация'}
        </h1>

        <label className="mb-3 block">
          <span className="micro-label">Почта</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-lineStrong bg-white px-2 py-1.5 text-[13px] outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="micro-label">Пароль</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-lineStrong bg-white px-2 py-1.5 text-[13px] outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full border border-patina bg-patina px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-paper disabled:opacity-40"
        >
          {busy ? 'Минуту…' : mode === 'signin' ? 'Войти' : 'Создать аккаунт'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setMessage(null);
          }}
          className="mt-3 w-full text-[11px] text-graphiteSoft underline"
        >
          {mode === 'signin' ? 'Нет аккаунта — зарегистрироваться' : 'Уже есть аккаунт — войти'}
        </button>

        {message && <p className="mt-3 text-[12px] text-ochre">{message}</p>}
      </form>
    </div>
  );
}
