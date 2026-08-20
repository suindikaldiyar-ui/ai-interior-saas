import { headers } from 'next/headers';
import { ORG_HOST_HEADER, ORG_SLUG_HEADER } from './tenantHeaders';
import { supabaseService } from './supabase/server';
import type { Org } from '@/types/catalog';

/** Слаг арендатора из поддомена — его проставил middleware. */
export function orgSlugFromHeaders(): string | null {
  return headers().get(ORG_SLUG_HEADER);
}

export function hostFromHeaders(): string {
  return headers().get(ORG_HOST_HEADER) ?? '';
}

const ORG_FIELDS = 'id, slug, name, logo_url, accent_color, domain, plan';

/**
 * Брендирование берётся по домену ещё до входа пользователя — иначе страница
 * клиента и экран логина показывались бы в дефолтных цветах платформы.
 * Читаем сервисным ключом: анонимной сессии политики orgs ничего не покажут.
 */
export async function orgByHost(): Promise<Org | null> {
  const service = supabaseService();
  if (!service) return null;

  const slug = orgSlugFromHeaders();
  const host = hostFromHeaders().toLowerCase().split(':')[0];

  if (slug) {
    const { data } = await service
      .from('orgs')
      .select(ORG_FIELDS)
      .eq('slug', slug)
      .maybeSingle();
    if (data) return data as Org;
  }

  if (host) {
    const { data } = await service
      .from('orgs')
      .select(ORG_FIELDS)
      .eq('domain', host)
      .maybeSingle();
    if (data) return data as Org;
  }

  return null;
}

export async function orgById(id: string): Promise<Org | null> {
  const service = supabaseService();
  if (!service) return null;
  const { data } = await service
    .from('orgs')
    .select(ORG_FIELDS)
    .eq('id', id)
    .maybeSingle();
  return (data as Org) ?? null;
}

/** Акцентный цвет арендатора подменяет патину во всём интерфейсе. */
export function brandStyle(org: Org | null): Record<string, string> {
  if (!org) return {};
  return { '--patina': org.accent_color, '--brand': org.accent_color };
}
