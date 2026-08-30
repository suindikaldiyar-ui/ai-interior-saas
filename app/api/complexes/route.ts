import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { COMPLEX_FIELDS, READY_FIELDS, fetchLibrary, toComplex, toReady } from '@/lib/complexes';
import type { ReadyProject } from '@/types/complexes';
import { slugify, uniqueSlug } from '@/lib/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Жилые комплексы организации.
 *
 * Библиотека принадлежит компании: org_id проставляется здесь, а не
 * приходит из запроса. RLS отсечёт чужое в любом случае, но подделанный
 * org_id не должен доходить даже до политики.
 */

type Body = {
  id?: string;
  name?: string;
  developer?: string;
  city?: string;
  isPublic?: boolean;
};

async function orgOf(supabase: ReturnType<typeof supabaseServer>) {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1);

  return (data?.[0]?.org_id as string | undefined) ?? null;
}

/**
 * Библиотека организации для экрана замера: ЖК, планировки и готовые
 * проекты. Один запрос — замерщик стоит в квартире и ждать не должен.
 */
export async function GET() {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ library: [], ready: {} });
  }

  const orgId = await orgOf(supabase);
  if (!orgId) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const library = await fetchLibrary(supabase, orgId);

  const planIds = library.flatMap((entry) => entry.plans.map((p) => p.id));
  const ready: Record<string, ReadyProject[]> = {};

  if (planIds.length > 0) {
    const { data } = await supabase
      .from('ready_projects')
      .select(READY_FIELDS)
      .in('floor_plan_id', planIds)
      .order('created_at', { ascending: false });

    for (const row of data ?? []) {
      const project = toReady(row as never);
      ready[project.floorPlanId] = [...(ready[project.floorPlanId] ?? []), project];
    }
  }

  return NextResponse.json({ library, ready });
}

export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const orgId = await orgOf(supabase);
  if (!orgId) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Название ЖК обязательно.' }, { status: 400 });

  // Слаг уникален внутри организации: два «Апельсина» у разных компаний — норма.
  const { data: existing } = await supabase
    .from('complexes')
    .select('slug')
    .eq('org_id', orgId);

  const slug = uniqueSlug(name, (existing ?? []).map((row) => String(row.slug)));

  const { data, error } = await supabase
    .from('complexes')
    .insert({
      org_id: orgId,
      slug,
      name,
      developer: (body.developer ?? '').trim(),
      city: (body.city ?? '').trim(),
      is_public: body.isPublic ?? true,
    })
    .select(COMPLEX_FIELDS)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `ЖК не сохранён: ${error?.message ?? 'нет данных'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, complex: toComplex(data as never) });
}

export async function PATCH(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const orgId = await orgOf(supabase);
  if (!orgId) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.id) return NextResponse.json({ error: 'Нужен id ЖК.' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    patch.name = body.name.trim();
    patch.slug = slugify(body.name);
  }
  if (body.developer !== undefined) patch.developer = body.developer.trim();
  if (body.city !== undefined) patch.city = body.city.trim();
  if (body.isPublic !== undefined) patch.is_public = body.isPublic;

  // RLS не даст тронуть чужой ЖК: строка просто не найдётся.
  const { data, error } = await supabase
    .from('complexes')
    .update(patch)
    .eq('id', body.id)
    .select(COMPLEX_FIELDS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'ЖК не найден.' }, { status: 404 });

  return NextResponse.json({ ok: true, complex: toComplex(data as never) });
}
