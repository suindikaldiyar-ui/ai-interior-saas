import Link from 'next/link';
import LoginForm from '@/components/LoginForm';
import ThemeToggle from '@/components/ThemeToggle';
import { orgBySlug } from '@/lib/org';

export const dynamic = 'force-dynamic';

/**
 * Вход по ссылке на почту.
 *
 * Паролей нет намеренно: замерщик открывает приложение в квартире, стоя,
 * с планшетом в одной руке. Вводить туда пароль неудобно, а восстанавливать
 * забытый — тем более. Одно поле и одна кнопка.
 *
 * БРЕНД КОМПАНИИ ПРИХОДИТ СЛАГОМ В АДРЕСЕ (`/login?org=kuhni-plus`), а не
 * по хосту: все компании живут на одной платформе, поддоменов им никто не
 * выдавал, и `orgByHost` нашёл бы здесь либо ничего, либо чужую компанию.
 * Ссылку с этим параметром ставит демо-страница — человек приходит с неё и
 * обязан увидеть тот же логотип, а не платформенный.
 *
 * Серверный компонент: логотип и цвет уходят в первый же HTML, без мигания
 * платформенным брендом и без запроса из браузера.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { org?: string };
}) {
  const org = searchParams.org ? await orgBySlug(searchParams.org) : null;
  const accent = org?.accent_color || null;

  return (
    <main
      className="mw-root flex min-h-screen items-center justify-center px-4"
      style={accent ? { ['--patina' as string]: accent, ['--brand' as string]: accent } : undefined}
    >
      <div className="w-full max-w-sm">
        <div className="mb-1 flex items-center justify-between">
          {org?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo_url} alt={org.name} className="h-7 object-contain" />
          ) : (
            <p className="mw-label">{org?.name ?? 'InteriorAI Studio'}</p>
          )}
          <ThemeToggle />
        </div>
        <h1 className="mw-title mb-1">Вход в кабинет</h1>
        <p className="mb-5 text-[13px] text-graphiteMw">
          Пришлём ссылку на почту — пароль не нужен.
        </p>

        <LoginForm />

        {org ? (
          <Link
            href={`/demo/${encodeURIComponent(org.slug)}`}
            className="mw-btn mw-btn-ghost mt-4 w-full"
          >
            Вернуться к демонстрации
          </Link>
        ) : (
          <Link href="/demo" className="mw-btn mw-btn-ghost mt-4 w-full">
            Посмотреть демонстрацию без входа
          </Link>
        )}
      </div>
    </main>
  );
}
