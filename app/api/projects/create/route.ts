import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { DEFAULT_REQUIREMENTS } from '@/lib/millwork/workspace';
import type { Measurement, RunRequirements } from '@/types/millwork';
import type { Survey } from '@/types/survey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateRequest = {
  address?: string;
  zone?: string;
  clientName?: string;
  clientPhone?: string;
  surveyor?: string;
  measurement?: Measurement;
  requirements?: RunRequirements;
  /** Замер целиком, вместе с состояниями величин. */
  survey?: Survey;
  /** Типовая планировка ЖК, если объект собран по ней. */
  floorPlanId?: string;
};

/** Новый объект: адрес, контакт клиента и замер. Дальше сразу конфигуратор. */
export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  let body: CreateRequest;
  try {
    body = (await request.json()) as CreateRequest;
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать запрос.' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1);

  const orgId = membership?.[0]?.org_id as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: 'У пользователя нет организации.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      address: body.address ?? '',
      zone: body.zone ?? 'Кухня',
      client_name: body.clientName ?? '',
      client_phone: body.clientPhone ?? '',
      surveyor: body.surveyor ?? '',
      // Объект помнит свою планировку: по ней видно, откуда размеры,
      // и в неё же уходит «сохранить как готовый проект».
      floor_plan_id: body.floorPlanId ?? null,
      measurements: body.measurement ?? {},
      millwork: {
        requirements: body.requirements ?? DEFAULT_REQUIREMENTS,
        // Состояния величин обязаны пережить перезагрузку: иначе «принято
        // по умолчанию» при следующем открытии станет «замерено».
        ...(body.survey ? { survey: body.survey } : {}),
      },
      // Замер внесён — объект сразу переходит в расчёт.
      status: 'in_progress',
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `Не удалось создать объект: ${error?.message ?? 'нет данных'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, projectId: data.id });
}
