import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { escapeHtml, notifyTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Заявка с публичной страницы планировки.
 *
 * Открыта без входа: её оставляет человек с рекламы. Пишем в базу СНАЧАЛА,
 * уведомляем ПОТОМ — упавший телеграм не должен стоить компании лида.
 *
 * Сервисный ключ здесь оправдан тем же, чем в кабинете клиента: анонимной
 * сессии политики не дадут написать ни строки, а доступ ограничен тем, что
 * заявка привязывается к существующей публичной планировке.
 */

type Body = {
  planId?: string;
  name?: string;
  phone?: string;
  comment?: string;
};

/** Телефон — единственное обязательное поле: по нему перезванивают. */
function cleanPhone(value: string): string {
  return value.replace(/[^\d+]/g, '').slice(0, 20);
}

export async function POST(request: Request) {
  const service = supabaseService();
  if (!service) {
    return NextResponse.json({ error: 'Приём заявок не настроен.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const phone = cleanPhone(String(body.phone ?? ''));
  const name = String(body.name ?? '').trim().slice(0, 120);
  const comment = String(body.comment ?? '').trim().slice(0, 500);

  if (!body.planId || phone.length < 6) {
    return NextResponse.json({ error: 'Оставьте номер телефона.' }, { status: 400 });
  }

  // Заявка только на публичную планировку: скрытую в рекламе не показывают.
  const { data: plan } = await service
    .from('floor_plans')
    .select('id, code, is_public, complexes!inner(name, city, org_id)')
    .eq('id', body.planId)
    .eq('is_public', true)
    .maybeSingle();

  if (!plan) return NextResponse.json({ error: 'Планировка не найдена.' }, { status: 404 });

  const { error } = await service.from('plan_leads').insert({
    floor_plan_id: plan.id,
    name,
    phone,
    comment,
  });

  if (error) {
    return NextResponse.json(
      { error: `Заявка не сохранилась: ${error.message}` },
      { status: 500 },
    );
  }

  const complex = (plan as unknown as { complexes: { name: string; city: string } }).complexes;

  /*
   * Уведомление — приятное дополнение, а не условие успеха: заявка уже
   * в базе, и менеджер увидит её в любом случае.
   */
  const notice = await notifyTelegram(
    `<b>Заявка с планировки</b>\n` +
      `${escapeHtml(complex.name)} · ${escapeHtml(String(plan.code))}\n` +
      `${escapeHtml(name || 'без имени')} · ${escapeHtml(phone)}` +
      (comment ? `\n${escapeHtml(comment)}` : ''),
  );

  return NextResponse.json({ ok: true, notified: notice.sent });
}
