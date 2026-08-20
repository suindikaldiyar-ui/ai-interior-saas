import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ORG_HOST_HEADER, ORG_SLUG_HEADER } from '@/lib/tenantHeaders';

/**
 * Две задачи: обновить сессию Supabase и определить арендатора по домену.
 *
 * Домен кладём в заголовки, а не ходим за организацией в базу прямо здесь:
 * middleware выполняется на каждый запрос, лишний round-trip к базе на краю
 * стоит дороже, чем один запрос в layout.
 *
 * На middleware завязана изоляция арендаторов, поэтому Next обязан быть
 * на патче 14.2.25+ — в ранних версиях CVE-2025-29927 позволяет его обойти.
 */

/** Домены, у которых первый сегмент — это slug арендатора, а не сам сайт. */
const ROOT_DOMAINS = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function resolveSlug(host: string): string | null {
  const clean = host.toLowerCase().split(':')[0];
  if (!clean || clean === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(clean)) return null;

  for (const root of ROOT_DOMAINS) {
    if (clean === root) return null;
    if (clean.endsWith(`.${root}`)) {
      const sub = clean.slice(0, -(root.length + 1));
      // Служебные поддомены арендаторами не считаем.
      if (!sub || sub === 'www' || sub === 'app') return null;
      return sub.split('.')[0];
    }
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const slug = resolveSlug(host);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ORG_HOST_HEADER, host);
  if (slug) requestHeaders.set(ORG_SLUG_HEADER, slug);
  else requestHeaders.delete(ORG_SLUG_HEADER);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      get: (name: string) => request.cookies.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: requestHeaders } });
        response.cookies.set({ name, value, ...options });
      },
      remove: (name: string, options: CookieOptions) => {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: requestHeaders } });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  // Обновляет истёкший access token и переписывает cookie.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Всё, кроме статики и картинок: там сессия не нужна,
     * а лишний вызов на каждый файл заметно бьёт по времени ответа.
     */
    '/((?!_next/static|_next/image|favicon.ico|references/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
