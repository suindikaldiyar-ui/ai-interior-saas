import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import {
  GATE_COOKIE,
  GATE_MAX_AGE_S,
  gateToken,
  safeEqual,
  safeNext,
  sitePassword,
} from '@/lib/gate';

/**
 * Дверь на сайт до запуска.
 *
 * Одно поле и одна кнопка, без объяснений: объяснять тут нечего, а тот, кто
 * пароль знает, вводит его за пару секунд. Форма отправляется на сервер, а
 * не через `fetch`: страница обязана работать даже там, где скрипты ещё не
 * загрузились — это первый экран продукта.
 */

export const dynamic = 'force-dynamic';

async function enter(formData: FormData) {
  'use server';

  const password = sitePassword();
  const next = safeNext(String(formData.get('next') ?? '/'));

  // Пароль не задан — дверь снята вовсе, и держать человека здесь незачем.
  if (!password) redirect(next);

  const entered = String(formData.get('password') ?? '');

  if (!safeEqual(entered, password)) {
    /*
     * Пауза на неверном пароле. Перебор по сети от этого не становится
     * невозможным, но перестаёт быть быстрым, а честному человеку
     * полсекунды незаметны.
     */
    await new Promise((resolve) => setTimeout(resolve, 500));
    redirect(`/gate?error=1&next=${encodeURIComponent(next)}`);
  }

  cookies().set({
    name: GATE_COOKIE,
    value: await gateToken(password),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GATE_MAX_AGE_S,
  });

  redirect(next);
}

export default function GatePage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
}) {
  const next = safeNext(searchParams?.next);
  const failed = searchParams?.error === '1';

  // Пароль не задан — двери нет вовсе, и держать человека здесь незачем.
  if (!sitePassword()) redirect(next);

  return (
    <main className="mw-root flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-1 flex items-center justify-between">
          <p className="mw-label">InteriorAI Studio</p>
          <ThemeToggle />
        </div>
        <h1 className="mw-title mb-5">Доступ по паролю</h1>

        <form action={enter} className="mw-panel">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="mw-label">Пароль</span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              className="mw-field mt-2"
            />
          </label>

          <button type="submit" className="mw-btn mw-btn-lg mw-btn-primary mt-3 w-full">
            Войти
          </button>

          {failed && <p className="mt-3 text-[13px] text-alert">Пароль не подошёл.</p>}
        </form>
      </div>
    </main>
  );
}
