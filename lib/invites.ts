import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Приглашения сотрудников.
 *
 * Токен приглашения по почте мы не рассылаем: письмо со ссылкой на вход
 * человек и так получает от Supabase. Приглашение — это запись «такой-то
 * адрес ждут в такой-то компании с такой ролью». Как только он войдёт,
 * членство создаётся само.
 */

export const ORG_ROLES = ['owner', 'manager', 'surveyor'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** `designer` остался с прошлого слоя: показываем, но не раздаём. */
export const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  surveyor: 'Замерщик',
  designer: 'Дизайнер',
};

export const ROLE_HINT: Record<OrgRole, string> = {
  owner: 'Каталог, цены, сотрудники, все объекты',
  manager: 'Объекты и каталог, приглашает замерщиков',
  surveyor: 'Замер и конфигурация, каталог только смотрит',
};

export type InviteRow = {
  id: string;
  email: string;
  role: OrgRole;
  accepted_at: string | null;
  created_at: string;
};

export type MemberRow = {
  user_id: string;
  role: OrgRole;
  email: string;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Принять приглашение при входе. Идёт через сервисный ключ: у пользователя
 * ещё нет членства, а значит и прав ни на одну строку организации.
 * Проверка здесь одна и она достаточная — совпадение подтверждённой почты.
 */
export async function claimInvite(
  service: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<string | null> {
  const email = normalizeEmail(user.email ?? '');
  if (!email) return null;

  const { data: invites } = await service
    .from('org_invites')
    .select('id, org_id, role')
    .eq('email', email)
    .is('accepted_at', null)
    .order('created_at', { ascending: true })
    .limit(1);

  const invite = invites?.[0];
  if (!invite) return null;

  const { error } = await service
    .from('org_members')
    .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role });

  // Уже состоит в компании — приглашение всё равно закрываем.
  if (error && !error.message.includes('duplicate')) return null;

  await service
    .from('org_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  return invite.org_id as string;
}
