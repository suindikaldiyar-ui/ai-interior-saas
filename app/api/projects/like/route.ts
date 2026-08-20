import { NextResponse } from 'next/server';
import { escapeHtml, notifyTelegram } from '@/lib/telegram';
import { supabaseService } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Клиент отметил вариант. Доступ — по share_token, авторизации нет:
 * токен и есть секрет. Пишем сервисным ключом, потому что анонимной сессии
 * политики проектов ничего не разрешают.
 */
export async function POST(request: Request) {
  const service = supabaseService();
  if (!service) {
    return NextResponse.json(
      { error: 'Сервер не настроен (нужен SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  let body: { token?: string; renderId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }

  const token = String(body.token ?? '');
  const renderId = String(body.renderId ?? '');
  if (!token || !renderId) {
    return NextResponse.json({ error: 'Нужны token и renderId.' }, { status: 400 });
  }

  const { data: project } = await service
    .from('projects')
    .select('id, client_name, client_phone, org_id')
    .eq('share_token', token)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Проект не найден.' }, { status: 404 });
  }

  // Рендер обязан принадлежать этому же проекту — иначе по чужому id
  // можно было бы пометить чужой вариант.
  const { data: render } = await service
    .from('renders')
    .select('id, style_id')
    .eq('id', renderId)
    .eq('project_id', project.id)
    .maybeSingle();

  if (!render) {
    return NextResponse.json({ error: 'Вариант не найден.' }, { status: 404 });
  }

  const { error } = await service
    .from('projects')
    .update({
      liked_render_id: render.id,
      liked_at: new Date().toISOString(),
      status: 'approved',
    })
    .eq('id', project.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: org } = await service
    .from('orgs')
    .select('name')
    .eq('id', project.org_id)
    .maybeSingle();

  const notification = await notifyTelegram(
    [
      '🔥 <b>Клиент выбрал вариант</b>',
      org?.name ? `Компания: ${escapeHtml(org.name)}` : '',
      project.client_name ? `Клиент: ${escapeHtml(project.client_name)}` : '',
      project.client_phone ? `Телефон: ${escapeHtml(project.client_phone)}` : '',
      `Стиль: ${escapeHtml(render.style_id)}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  // Отметка сохранена в любом случае — молчащий Telegram не должен
  // выглядеть для клиента как ошибка.
  return NextResponse.json({ ok: true, notified: notification.sent });
}
