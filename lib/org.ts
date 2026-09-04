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

/**
 * Организация для ПУБЛИЧНОЙ страницы.
 *
 * `orgByHost` находит арендатора по поддомену или привязанному домену. Пока
 * компания одна и домен ей не привязан, он не находит НИЧЕГО: на localhost,
 * на адресе хостинга и на голом корневом домене публичные страницы
 * оказывались пустыми, а страница планировки отдавала 404 — при полностью
 * опубликованных данных.
 *
 * Поэтому запасной путь: если организация в базе РОВНО ОДНА, это она.
 * Утечки между арендаторами здесь нет — как только компаний становится
 * больше одной, мы не угадываем, а честно ничего не показываем: чужая
 * библиотека на чужом домене хуже пустой страницы.
 */
export async function publicOrg(): Promise<Org | null> {
  const byHost = await orgByHost();
  if (byHost) return byHost;

  const service = supabaseService();
  if (!service) return null;

  const { data } = await service.from('orgs').select(ORG_FIELDS).limit(2);
  return (data ?? []).length === 1 ? ((data as Org[])[0] ?? null) : null;
}

/**
 * Организация по слагу — для ПУБЛИЧНОЙ демо-страницы.
 *
 * Слаг и есть адрес: `/demo/kuhni-plus`. Ищем именно по нему, а не по хосту:
 * все компании живут на одной платформе, поддоменов им никто не выдавал, и
 * `orgByHost` нашёл бы здесь либо ничего, либо чужую организацию.
 *
 * Сервисным ключом и по СПИСКУ ПОЛЕЙ, как остальные публичные страницы:
 * анонимной политики у orgs нет вовсе, а `select *` отдал бы наружу всё,
 * что появится в таблице завтра.
 */
export async function orgBySlug(slug: string): Promise<Org | null> {
  const service = supabaseService();
  if (!service || !slug.trim()) return null;

  const { data } = await service
    .from('orgs')
    .select(ORG_FIELDS)
    .eq('slug', slug.trim().toLowerCase())
    .maybeSingle();

  return (data as Org) ?? null;
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
