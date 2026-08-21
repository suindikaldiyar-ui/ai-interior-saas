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

  let body: { token?: string; renderId?: string; approved?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }

  const token = String(body.token ?? '');
  const renderId = String(body.renderId ?? '');
  if (!token || (!renderId && !body.approved)) {
    return NextResponse.json(
      { error: 'Нужен token и либо renderId, либо approved.' },
      { status: 400 },
    );
  }

  const { data: project } = await service
    .from('projects')
    .select('id, client_name, client_phone, org_id')
    .eq('share_token', token)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Проект не найден.' }, { status: 404 });
  }

  /*
   * Рендер обязан принадлежать этому же проекту — иначе по чужому id
   * можно было бы пометить чужой вариант. У кухни картинки нет вовсе:
   * клиент соглашается с чертежом и сметой, а не с изображением.
   */
  let render: { id: string; style_id: string } | null = null;
  if (renderId) {
    const { data } = await service
      .from('renders')
      .select('id, style_id')
      .eq('id', renderId)
      .eq('project_id', project.id)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: 'Вариант не найден.' }, { status: 404 });
    }
    render = data as { id: string; style_id: string };
  }

  const { error } = await service
    .from('projects')
    .update({
      ...(render ? { liked_render_id: render.id } : {}),
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
      render ? `Стиль: ${escapeHtml(render.style_id)}` : 'Согласована конфигурация кухни',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  // Отметка сохранена в любом случае — молчащий Telegram не должен
  // выглядеть для клиента как ошибка.
  return NextResponse.json({ ok: true, notified: notification.sent });
}
