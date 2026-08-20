import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_READY, SUPABASE_URL } from './config';

/** Серверный клиент с сессией пользователя из cookie. RLS работает от его имени. */
export function supabaseServer(): SupabaseClient | null {
  if (!SUPABASE_READY) return null;
  const store = cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get: (name: string) => store.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => {
        // В Server Component запись cookie запрещена — сессию обновляет middleware.
        try {
          store.set({ name, value, ...options });
        } catch {
          /* no-op */
        }
      },
      remove: (name: string, options: CookieOptions) => {
        try {
          store.set({ name, value: '', ...options });
        } catch {
          /* no-op */
        }
      },
    },
  });
}

/**
 * Сервисный клиент в обход RLS. Только для операций, где доступ уже проверен
 * другим способом: чтение проекта по share_token, запись рендеров.
 * SUPABASE_SERVICE_ROLE_KEY не должен попадать в клиентский бандл — файл
 * импортируется только из route handlers и серверных компонентов.
 */
export function supabaseService(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Текущий пользователь или null. */
export async function currentUser() {
  const supabase = supabaseServer();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export type CurrentOrg = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  accent_color: string;
  domain: string | null;
  plan: string;
  role: string;
};

/**
 * Организация текущего пользователя. Если у него несколько — берём ту,
 * что закреплена за доменом (middleware кладёт slug в заголовок), иначе первую.
 */
export async function currentOrg(preferredSlug?: string | null): Promise<CurrentOrg | null> {
  const supabase = supabaseServer();
  if (!supabase) return null;

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('org_members')
    .select('role, orgs!inner(id, slug, name, logo_url, accent_color, domain, plan)')
    .eq('user_id', userData.user.id);

  if (error || !data || data.length === 0) return null;

  type Row = { role: string; orgs: Omit<CurrentOrg, 'role'> };
  const rows = data as unknown as Row[];
  const picked =
    (preferredSlug && rows.find((r) => r.orgs.slug === preferredSlug)) || rows[0];

  return { ...picked.orgs, role: picked.role };
}
