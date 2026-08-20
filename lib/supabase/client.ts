'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_READY, SUPABASE_URL } from './config';

let cached: SupabaseClient | null = null;

/** Браузерный клиент-синглтон. null, если Supabase не настроен. */
export function supabaseBrowser(): SupabaseClient | null {
  if (!SUPABASE_READY) return null;
  if (!cached) {
    cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return cached;
}
