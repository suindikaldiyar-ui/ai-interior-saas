import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { PLAN_FIELDS, toPlan } from '@/lib/complexes';
import { uniqueSlug } from '@/lib/slug';
import { DEFAULT_TOLERANCE_MM, type FloorPlanZone, type RoomArea } from '@/types/complexes';
import type { Measurement, ZoneKind } from '@/types/millwork';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Планировка внутри ЖК.
 *
 * Заводится БЕЗ замера и уже в этом виде работает: публичная страница
 * открывается, заявка приходит. Замер добавляется потом отдельным PATCH —
 * он и «открывает» планировку для всех одинаковых квартир.
 */

type CreateBody = {
  complexId?: string;
  code?: string;
  rooms?: number;
  areaM2?: number;
  roomAreas?: RoomArea[];
  isPublic?: boolean;
  toleranceMm?: number;
};

type PatchBody = CreateBody & {
  id?: string;
  /** Замер зоны: он и открывает планировку. */
  zone?: ZoneKind;
  measurement?: Measurement;
  notes?: string;
  measuredBy?: string;
  sourceApartment?: string;
};

async function orgOf(supabase: NonNullable<ReturnType<typeof supabaseServer>>) {
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

const cleanAreas = (list: RoomArea[] | undefined): RoomArea[] =>
  (list ?? [])
    .map((a) => ({ name: String(a.name ?? '').trim(), areaM2: Number(a.areaM2) || 0 }))
    .filter((a) => a.name.length > 0);

export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const orgId = await orgOf(supabase);
  if (!orgId) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const code = (body.code ?? '').trim();
  if (!body.complexId || !code) {
    return NextResponse.json({ error: 'Нужны ЖК и код планировки.' }, { status: 400 });
  }

  // Чужой ЖК не найдётся: RLS сюда уже применена.
  const { data: complex } = await supabase
    .from('complexes')
    .select('id')
    .eq('id', body.complexId)
    .maybeSingle();

  if (!complex) return NextResponse.json({ error: 'ЖК не найден.' }, { status: 404 });

  const { data: existing } = await supabase
    .from('floor_plans')
    .select('slug')
    .eq('complex_id', body.complexId);

  const slug = uniqueSlug(code, (existing ?? []).map((row) => String(row.slug)));

  const { data, error } = await supabase
    .from('floor_plans')
    .insert({
      complex_id: body.complexId,
      slug,
      code,
      rooms: Math.max(1, Math.round(body.rooms ?? 1)),
      area_m2: Number(body.areaM2) || 0,
      room_areas: cleanAreas(body.roomAreas),
      tolerance_mm: Math.max(0, Math.round(body.toleranceMm ?? DEFAULT_TOLERANCE_MM)),
      is_public: body.isPublic ?? true,
    })
    .select(PLAN_FIELDS)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `Планировка не сохранена: ${error?.message ?? 'нет данных'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, plan: toPlan(data as never) });
}

/**
 * Правка планировки и — главное — её ЗАМЕР.
 *
 * Замер зоны заменяет прежний замер той же зоны: второй выезд на ту же
 * квартиру уточняет размеры, а не заводит вторую кухню.
 */
export async function PATCH(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const orgId = await orgOf(supabase);
  if (!orgId) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  if (!body.id) return NextResponse.json({ error: 'Нужен id планировки.' }, { status: 400 });

  const { data: current } = await supabase
    .from('floor_plans')
    .select(PLAN_FIELDS)
    .eq('id', body.id)
    .maybeSingle();

  if (!current) return NextResponse.json({ error: 'Планировка не найдена.' }, { status: 404 });

  const plan = toPlan(current as never);
  const patch: Record<string, unknown> = {};

  if (body.code !== undefined) patch.code = body.code.trim();
  if (body.rooms !== undefined) patch.rooms = Math.max(1, Math.round(body.rooms));
  if (body.areaM2 !== undefined) patch.area_m2 = Number(body.areaM2) || 0;
  if (body.roomAreas !== undefined) patch.room_areas = cleanAreas(body.roomAreas);
  if (body.isPublic !== undefined) patch.is_public = body.isPublic;
  if (body.toleranceMm !== undefined) {
    patch.tolerance_mm = Math.max(0, Math.round(body.toleranceMm));
  }

  if (body.zone && body.measurement) {
    const zones: FloorPlanZone[] = [
      ...plan.zones.filter((z) => z.zone !== body.zone),
      { zone: body.zone, measurement: body.measurement, notes: body.notes },
    ];

    patch.zones = zones;
    /*
     * Дата и автор замера — это ЧЕСТНОСТЬ, а не метаданные: на публичной
     * странице написано, когда и на какой квартире сняты размеры.
     */
    patch.measured_at = new Date().toISOString();
    if (body.measuredBy) patch.measured_by = body.measuredBy;
    if (body.sourceApartment) patch.source_apartment = body.sourceApartment;
  }

  const { data, error } = await supabase
    .from('floor_plans')
    .update(patch)
    .eq('id', body.id)
    .select(PLAN_FIELDS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Планировка не найдена.' }, { status: 404 });

  return NextResponse.json({ ok: true, plan: toPlan(data as never) });
}
