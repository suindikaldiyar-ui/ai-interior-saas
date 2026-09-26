import { NextResponse } from 'next/server';
import { fetchCatalog } from '@/lib/catalog';
import { PLAN_FIELDS, READY_FIELDS, fetchReady, toPlan, toReady } from '@/lib/complexes';
import { buildAutoProjects } from '@/lib/millwork/autoProject';
import { ratesFromCatalog } from '@/lib/millwork/rates';
import { parseOrgTemplates } from '@/lib/millwork/templates';
import { supabaseServer } from '@/lib/supabase/server';
import { hasSchemeSizes, isMeasured } from '@/types/complexes';
import { productionSettings } from '@/types/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «Собрать проекты» — предварительный проект под планировку.
 *
 * Как только известна длина стены, всё остальное уже считается: шаблон по
 * длине, ряд, смета по ставкам организации. Считает ТОТ ЖЕ код, что и у
 * замерщика: две ветки расчёта разошлись бы, и предварительная цена
 * отличалась бы от итоговой не из-за размеров, а из-за двух калькуляторов.
 *
 * На зону — РОВНО ОДИН автопроект: выбор из трёх выдуманных вариантов хуже
 * одного честного. Ручной проект замерщика не трогаем никогда.
 */
export async function POST(request: Request) {
  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { planId?: string };
  if (!body.planId) return NextResponse.json({ error: 'Нужен id планировки.' }, { status: 400 });

  // Чужая планировка не найдётся: RLS уже применена к этому запросу.
  const { data: planRow } = await supabase
    .from('floor_plans')
    .select(`${PLAN_FIELDS}, complexes!inner(org_id)`)
    .eq('id', body.planId)
    .maybeSingle();

  if (!planRow) return NextResponse.json({ error: 'Планировка не найдена.' }, { status: 404 });

  const plan = toPlan(planRow as never);
  const orgId = (planRow as unknown as { complexes: { org_id: string } }).complexes.org_id;

  /*
   * Без масштаба длина стены неизвестна, а цена без длины — выдуманное
   * число. Отказываем прямо и говорим, что сделать.
   */
  if (!hasSchemeSizes(plan) && !isMeasured(plan)) {
    return NextResponse.json(
      {
        error:
          'Сначала снимите размеры со схемы или дождитесь замера: ' +
          'без длины ряда цена будет выдуманной.',
      },
      { status: 400 },
    );
  }

  const [catalogRead, { data: orgRow }] = await Promise.all([
    fetchCatalog(supabase, orgId),
    supabase.from('orgs').select('run_templates, production').eq('id', orgId).maybeSingle(),
  ]);

  /* Без каталога цена автопроекта — нули с виду настоящей цены (ловушка 142). */
  if (catalogRead.error !== null) {
    return NextResponse.json({ error: catalogRead.error }, { status: 503 });
  }

  const result = buildAutoProjects({
    plan,
    rates: ratesFromCatalog(catalogRead.entries),
    templates: parseOrgTemplates(orgRow?.run_templates),
    // Настройки цеха: от толщин и зазоров зависит расход материалов.
    production: productionSettings(orgRow?.production),
    calculatedAt: new Date().toISOString(),
  });

  if (result.blocked) {
    return NextResponse.json({ error: result.blocked }, { status: 400 });
  }

  const existing = await fetchReady(supabase, plan.id);

  /*
   * Ручной проект главнее: зону, где он есть, не трогаем вовсе — ни
   * добавлением, ни заменой. Автоматический там был бы шумом.
   */
  const manualZones = new Set(existing.filter((p) => !p.isAuto).map((p) => p.zone));
  const staleAuto = existing.filter((p) => p.isAuto).map((p) => p.id);

  const wanted = result.projects.filter((p) => !manualZones.has(p.zone));
  const skipped = [
    ...result.skipped,
    ...result.projects
      .filter((p) => manualZones.has(p.zone))
      .map((p) => ({ zone: p.zone, reason: 'есть проект, собранный замерщиком — он главнее' })),
  ];

  // Пересборка заменяет прежние автопроекты, а не копит их.
  if (staleAuto.length > 0) {
    await supabase.from('ready_projects').delete().in('id', staleAuto);
  }

  if (wanted.length === 0) {
    return NextResponse.json({ ok: true, added: 0, skipped });
  }

  const { data, error } = await supabase
    .from('ready_projects')
    .insert(
      wanted.map((project) => ({
        floor_plan_id: plan.id,
        zone: project.zone,
        title: project.title,
        run: project.run,
        price_snapshot: project.estimate.priceSnapshot,
        total: project.estimate.total,
        is_auto: true,
        size_source: project.sizeSource,
      })),
    )
    .select(READY_FIELDS);

  if (error) {
    return NextResponse.json(
      { error: `Проекты не сохранились: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    added: data?.length ?? 0,
    skipped,
    projects: (data ?? []).map((row) => toReady(row as never)),
  });
}
