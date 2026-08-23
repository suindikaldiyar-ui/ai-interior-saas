import { notFound } from 'next/navigation';
import ClientPortal from '@/components/ClientPortal';
import ClientOffer from '@/components/millwork/ClientOffer';
import { fetchCatalog } from '@/lib/catalog';
import { DEFAULT_REQUIREMENTS, composeVariants, workspaceInput } from '@/lib/millwork/workspace';
import { VARIANT_STYLE } from '@/lib/millwork/styles';
import { isEstimatePreliminary, resolveSurvey } from '@/types/survey';
import type { MillworkState } from '@/lib/projects';
import { storageUrl } from '@/lib/supabase/config';
import { supabaseService } from '@/lib/supabase/server';
import { PROJECTS_BUCKET } from '@/lib/supabase/config';
import type { Org, ProjectSelections } from '@/types/catalog';
import type { FurnitureItem, RoomConfig } from '@/types/interior';
import type { Measurement } from '@/types/millwork';

export const dynamic = 'force-dynamic';

type PageProps = { params: { token: string } };

/**
 * Публичная страница по share_token, без авторизации.
 * Читаем сервисным ключом и отдаём наружу только то, что клиенту положено:
 * ни org_id, ни телефона других проектов здесь не появляется.
 */
export default async function SharePage({ params }: PageProps) {
  const service = supabaseService();
  if (!service) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="max-w-md text-center text-[13px] text-graphiteSoft">
          Кабинет клиента недоступен: не задан SUPABASE_SERVICE_ROLE_KEY.
        </p>
      </main>
    );
  }

  const { data: project } = await service
    .from('projects')
    .select(
      'id, org_id, address, zone, client_name, room, items, selections, status, liked_render_id, millwork, measurements, source_photo_path',
    )
    .eq('share_token', params.token)
    .maybeSingle();

  if (!project) notFound();

  const millwork = (project.millwork ?? {}) as MillworkState;
  const { data: offerOrg } = await service
    .from('orgs')
    .select('id, slug, name, logo_url, accent_color, domain, plan, city, phone')
    .eq('id', project.org_id as string)
    .maybeSingle();

  /*
   * Кухня показывается чертежом и сметой, а не картинкой. Пересчёта здесь
   * нет: варианты собираются по снимку цен, снятому в момент расчёта, —
   * клиент обязан видеть ровно ту сумму, что ему назвали на встрече.
   */
  if (millwork.priceSnapshot && Object.keys(millwork.priceSnapshot).length > 0) {
    const input = workspaceInput({
      title: (project.address as string) || 'Ваш проект',
      zone: (project.zone as string) || 'Кухня',
      measurement: project.measurements as Measurement,
      requirements: millwork.requirements ?? DEFAULT_REQUIREMENTS,
      rates: millwork.priceSnapshot,
    });

    const variantKey = millwork.selectedVariant ?? 'optimal';
    const disabled = {
      basic: millwork.disabled?.basic ?? [],
      optimal: millwork.disabled?.optimal ?? [],
      premium: millwork.disabled?.premium ?? [],
    };
    const variants = composeVariants(input, disabled, millwork.runs ?? {});

    /*
     * Фотография помещения и картинка выбранной комплектации: сравнение
     * «до и после» — главное доказательство, что планировка не поехала.
     */
    /*
     * Картинки всех трёх комплектаций лежат в Storage, поэтому «последняя»
     * больше не значит «та, что выбрали». Берём строку выбранного стиля,
     * и только если её нет — самую свежую.
     */
    const { data: renderRows } = await service
      .from('renders')
      .select('image_path, style_id, created_at')
      .eq('project_id', project.id as string)
      .order('created_at', { ascending: false });

    const chosenStyle = VARIANT_STYLE[millwork.selectedVariant ?? 'optimal'];
    const renderRow =
      (renderRows ?? []).find((r) => r.style_id === chosenStyle) ?? (renderRows ?? [])[0];
    // Те же состояния величин, что видел замерщик: клиент не должен узнать
    // о допущениях позже, чем подпишет.
    const survey = millwork.survey ? resolveSurvey(millwork.survey) : null;
    const chosen = variants.find((v) => v.key === variantKey) ?? variants[0];

    return (
      <ClientOffer
        token={params.token}
        org={(offerOrg as Org | null) ?? null}
        clientName={(project.client_name as string) ?? ''}
        title={input.title}
        zone={input.zone}
        run={chosen.run}
        variantTitle={chosen.title}
        estimate={chosen.estimate}
        photoUrl={
          project.source_photo_path
            ? storageUrl(PROJECTS_BUCKET, project.source_photo_path as string)
            : null
        }
        renderUrl={
          renderRow?.image_path
            ? storageUrl(PROJECTS_BUCKET, renderRow.image_path as string)
            : null
        }
        disabledKeys={disabled[variantKey]}
        approved={project.status === 'approved'}
        pending={survey?.stats.pending.map((p) => p.where) ?? []}
        preliminary={survey ? isEstimatePreliminary(survey.stats) : false}
      />
    );
  }

  const [{ data: renderRows }, { data: orgRow }] = await Promise.all([
    service
      .from('renders')
      .select('id, style_id, image_path, duration_ms, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false }),
    service
      .from('orgs')
      .select('id, slug, name, logo_url, accent_color, domain, plan')
      .eq('id', project.org_id)
      .maybeSingle(),
  ]);

  const catalog = await fetchCatalog(service, project.org_id as string);

  const renders = (renderRows ?? []).map((r) => ({
    id: r.id as string,
    styleId: r.style_id as string,
    url: storageUrl(PROJECTS_BUCKET, r.image_path as string),
    durationMs: (r.duration_ms as number | null) ?? undefined,
  }));

  return (
    <ClientPortal
      token={params.token}
      org={(orgRow as Org | null) ?? null}
      clientName={(project.client_name as string) ?? ''}
      room={project.room as RoomConfig}
      items={(project.items as FurnitureItem[]) ?? []}
      selections={(project.selections as ProjectSelections) ?? {}}
      catalog={catalog}
      renders={renders}
      likedRenderId={(project.liked_render_id as string | null) ?? null}
    />
  );
}
