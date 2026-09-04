import { NextResponse } from 'next/server';
import { seedOrg } from '@/lib/orgSeed';
import { supabaseServer, supabaseService } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Первая организация для нового пользователя.
 *
 * Идёт через сервисный ключ: политика orgs разрешает вставку только своим
 * участникам, а участников у только что созданной организации ещё нет —
 * без обхода RLS запись невозможна в принципе.
 */
export async function POST(request: Request) {
  const supabase = supabaseServer();
  const service = supabaseService();

  if (!supabase || !service) {
    return NextResponse.json(
      { error: 'Supabase не настроен (нужен и SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const existing = await service
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1);

  if (existing.data && existing.data.length > 0) {
    return NextResponse.json({ ok: true, orgId: existing.data[0].org_id });
  }

  let body: { name?: string; slug?: string; city?: string; phone?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* пустое тело — подставим значения по умолчанию */
  }

  const name = (body.name ?? '').trim() || 'Моя компания';
  const slug =
    (body.slug ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `org-${user.id.slice(0, 8)}`;

  const { data: org, error: orgError } = await service
    .from('orgs')
    .insert({ name, slug, city: (body.city ?? '').trim(), phone: (body.phone ?? '').trim() })
    .select('id')
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: `Не удалось создать организацию: ${orgError?.message ?? 'нет данных'}` },
      { status: 500 },
    );
  }

  const { error: memberError } = await service
    .from('org_members')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' });

  if (memberError) {
    return NextResponse.json(
      { error: `Организация создана, но участник не добавлен: ${memberError.message}` },
      { status: 500 },
    );
  }

  /*
   * КАТАЛОГ И ДЕМО-ОБЪЕКТ ЗАПОЛНЯЮТСЯ СРАЗУ.
   *
   * Главная опасность первого визита — пустой продукт: смета считает по
   * ставкам каталога, ставок нет, на экране нули, и компания решает, что
   * инструмент не работает. Прайс типовой и подписан как ориентир, а
   * демо-объект — готовая кухня с чертежом и сметой, которую можно
   * открыть и показать, ничего не вводя.
   *
   * Сервисным ключом: членство только что создано, и полагаться на то,
   * что политика уже видит нового участника, здесь незачем.
   *
   * Ошибка сида не отменяет создание организации: без каталога она
   * работает, а вот без организации не работает ничего. Поэтому пишем
   * результат в ответ и не роняем запрос.
   */
  const seeded = await seedOrg(service, org.id);

  return NextResponse.json({
    ok: true,
    orgId: org.id,
    catalog: {
      added: seeded.catalog.added,
      categories: seeded.catalog.addedCategories,
      error: seeded.catalog.error ?? null,
    },
    demo: {
      created: seeded.demo.created,
      projectId: seeded.demo.projectId ?? null,
      total: seeded.demo.total ?? null,
      error: seeded.demo.error ?? null,
    },
  });
}
