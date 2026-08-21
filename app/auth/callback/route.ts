import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Обмен кода из письма на сессию.
 *
 * Supabase присылает одноразовый `code`; клиентский SDK его не увидит,
 * потому что cookie сессии обязана быть httpOnly и выставляется сервером.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/projects';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no-code', url.origin));
  }

  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=not-configured', url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
