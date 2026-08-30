import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { READY_FIELDS, fetchReady, toReady } from '@/lib/complexes';
import { MAX_READY_PER_ZONE } from '@/types/complexes';
import type { Run, ZoneKind } from '@/types/millwork';
import type { RateTable } from '@/lib/millwork/estimate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «Сохранить как готовый проект».
 *
 * Ряд кладётся ЦЕЛИКОМ вместе со снимком цен — по той же причине, что и
 * состояние объекта: переоценка каталога не должна менять сумму, которую
 * уже показали клиенту на публичной странице.
 */

type Body = {
  floorPlanId?: string;
  zone?: ZoneKind;
  title?: string;
  run?: Run;
  priceSnapshot?: RateTable;
  total?: number;
  renderPath?: string;
};

export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.floorPlanId || !body.zone || !body.run) {
    return NextResponse.json(
      { error: 'Нужны планировка, зона и состав ряда.' },
      { status: 400 },
    );
  }

  // Чужая планировка не найдётся: RLS уже применена.
  const { data: plan } = await supabase
    .from('floor_plans')
    .select('id, zones, measured_at')
    .eq('id', body.floorPlanId)
    .maybeSingle();

  if (!plan) return NextResponse.json({ error: 'Планировка не найдена.' }, { status: 404 });

  /*
   * Готовый проект без замера — это цена, взятая из воздуха: длины ряда
   * ещё нет. Такую планировку сначала меряют.
   */
  const zones = Array.isArray(plan.zones) ? plan.zones : [];
  if (zones.length === 0 || !plan.measured_at) {
    return NextResponse.json(
      { error: 'Планировка ещё не обмерена: цена без длины ряда — выдуманное число.' },
      { status: 400 },
    );
  }

  const existing = await fetchReady(supabase, body.floorPlanId);
  const inZone = existing.filter((p) => p.zone === body.zone);

  /*
   * Больше трёх на зону не показываем — то же правило, что у компоновок.
   * Отказываем прямо: молча выбросить чужой проект нельзя, решение
   * «что убрать» принимает человек.
   */
  if (inZone.length >= MAX_READY_PER_ZONE) {
    return NextResponse.json(
      {
        error:
          `В этой зоне уже ${inZone.length} готовых проекта — больше клиенту не показывают. ` +
          'Удалите лишний и сохраните заново.',
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from('ready_projects')
    .insert({
      floor_plan_id: body.floorPlanId,
      zone: body.zone,
      title: (body.title ?? '').trim() || 'Готовый проект',
      run: body.run,
      price_snapshot: body.priceSnapshot ?? {},
      total: Number(body.total) || 0,
      render_path: body.renderPath ?? null,
    })
    .select(READY_FIELDS)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `Проект не сохранён: ${error?.message ?? 'нет данных'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, project: toReady(data as never) });
}

export async function DELETE(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Нужен id проекта.' }, { status: 400 });

  const { error } = await supabase.from('ready_projects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
