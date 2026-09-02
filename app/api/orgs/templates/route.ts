import { NextResponse } from 'next/server';
import { parseOrgTemplates } from '@/lib/millwork/templates';
import { currentOrg, supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Типовые решения компании. Правит владелец или менеджер. */
export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: 'Нет организации.' }, { status: 400 });
  if (org.role !== 'owner' && org.role !== 'manager') {
    return NextResponse.json(
      { error: 'Типовые решения правит владелец или менеджер.' },
      { status: 403 },
    );
  }

  let body: { templates?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* пустое тело — сохранится пустой список */
  }

  /*
   * Разбираем тем же кодом, что и чтение: в базу попадает только то,
   * что конфигуратор сумеет развернуть. Мусорный шаблон в списке хуже,
   * чем его отсутствие — замерщик выберет его при клиенте.
   */
  const clean = parseOrgTemplates(body.templates).map((t) => ({
    ...t,
    id: t.id.replace(/^org:/, ''),
  }));

  const { error } = await supabase
    .from('orgs')
    .update({ run_templates: clean })
    .eq('id', org.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: clean.length });
}

/**
 * Добавить ОДНО решение к уже сохранённым.
 *
 * Замерщик нажимает «Сохранить как решение» прямо на объекте, при клиенте.
 * POST переписывает весь список целиком — из конфигуратора так нельзя:
 * он не знает про остальные решения компании и стёр бы их.
 */
export async function PUT(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: 'Нет организации.' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { template?: unknown };
  const [template] = parseOrgTemplates([body.template]);

  if (!template) {
    return NextResponse.json(
      { error: 'Решение не сохранено: в нём нет ни техники, ни секций.' },
      { status: 400 },
    );
  }

  const { data: current } = await supabase
    .from('orgs')
    .select('run_templates')
    .eq('id', org.id)
    .maybeSingle();

  const existing = parseOrgTemplates(current?.run_templates).map((t) => ({
    ...t,
    id: t.id.replace(/^org:/, ''),
  }));

  const clean = { ...template, id: template.id.replace(/^org:/, '') };

  // Одноимённое решение заменяется, а не двоится: «наша базовая» одна.
  const next = [...existing.filter((t) => t.name !== clean.name), clean];

  const { error } = await supabase
    .from('orgs')
    .update({ run_templates: next })
    .eq('id', org.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: next.length, template: clean });
}
