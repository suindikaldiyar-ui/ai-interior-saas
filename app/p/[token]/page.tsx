import { notFound } from 'next/navigation';
import ClientPortal from '@/components/ClientPortal';
import ClientOffer from '@/components/millwork/ClientOffer';
import { fetchCatalog } from '@/lib/catalog';
import { projectOffer } from '@/lib/millwork/objectEstimate';
import { VARIANT_STYLE } from '@/lib/millwork/styles';
import { isEstimatePreliminary } from '@/types/survey';
import type { MillworkState } from '@/lib/projects';
import { storageUrl } from '@/lib/supabase/config';
import { supabaseService } from '@/lib/supabase/server';
import { PROJECTS_BUCKET } from '@/lib/supabase/config';
import { productionSettings, type Org, type ProjectSelections } from '@/types/catalog';
import type { FurnitureItem, RoomConfig } from '@/types/interior';
import type { Measurement } from '@/types/millwork';

export const dynamic = 'force-dynamic';

type PageProps = { params: { token: string } };

/**
 * Предложение не открылось — словами и без суммы.
 *
 * Сумма, собранная без каталога компании или по несошедшейся раскладке,
 * — это цифра, которую клиент запомнит, а компания не подпишет.
 */
function OfferUnavailable({ org, reason }: { org: Org | null; reason: string }) {
  return (
    <main className="mw-root flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="mb-2 text-[17px] font-medium">{org?.name ?? 'Ваш проект'}</p>
        <p className="text-[15px] leading-snug" data-offer-unavailable>
          {reason}
        </p>
        {org?.phone && (
          <a href={`tel:${org.phone}`} className="mt-3 inline-block text-[13px] text-cyanBright underline">
            Позвонить: {org.phone}
          </a>
        )}
      </div>
    </main>
  );
}

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
   * СМЕТА КАБИНЕТА — ТЕМИ ЖЕ ШАГАМИ, ЧТО У ЭКРАНА ДИЗАЙНЕРА (слой 52).
   *
   * Здесь была своя сборка: `workspaceInput` + `composeVariants` по снимку
   * цен, без позиций каталога, без фрезеровки и декоров корпуса, без
   * настроек цеха и без стен угловой кухни. Клиент видел фасады RAL по
   * ставке цеха и итог без пометки «неполный»: 1 571 843 ₸ против
   * 2 277 790 ₸ «неполный» на экране дизайнера.
   *
   * Теперь это `projectOffer` — место, композиция, вход с каталогом
   * организации, варианты с правками, ряды стен и смета объекта — те же
   * функции, что зовёт экран. Снимок цен держит сумму, которую назвали:
   * переоценка каталога после отправки её не меняет (ловушка 30).
   */
  if (millwork.priceSnapshot && Object.keys(millwork.priceSnapshot).length > 0) {
    const org = (offerOrg as Org | null) ?? null;
    const [catalogRead, { data: orgRow }] = await Promise.all([
      fetchCatalog(service, project.org_id as string),
      service.from('orgs').select('production').eq('id', project.org_id as string).maybeSingle(),
    ]);
    if (catalogRead.error !== null) {
      return (
        <OfferUnavailable
          org={org}
          reason="Предложение сейчас не открывается: каталог компании не прочитался. Обновите страницу через минуту."
        />
      );
    }

    const offer = projectOffer({
      title: (project.address as string) || 'Ваш проект',
      zone: (project.zone as string) || 'Кухня',
      measurement: project.measurements as Measurement,
      state: millwork,
      production: productionSettings(orgRow?.production),
      catalog: catalogRead.entries,
    });
    if (offer.state === 'refused') {
      return (
        <OfferUnavailable
          org={org}
          reason={`Расчёт по проекту сейчас не собирается: ${offer.refusal} Компания уточнит размеры и пришлёт ссылку ещё раз.`}
        />
      );
    }

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

    // Стиль выбирал замерщик; у старых объектов его нет — там стиль
    // выводился из комплектации, и эта таблица остаётся запасным вариантом.
    const chosenStyle =
      millwork.renderStyle ?? VARIANT_STYLE[millwork.selectedVariant ?? 'optimal'];
    const renderRow =
      (renderRows ?? []).find((r) => r.style_id === chosenStyle) ?? (renderRows ?? [])[0];
    // Те же состояния величин, что видел замерщик: клиент не должен узнать
    // о допущениях позже, чем подпишет.
    const survey = offer.resolution;

    return (
      <ClientOffer
        token={params.token}
        org={org}
        clientName={(project.client_name as string) ?? ''}
        title={(project.address as string) || 'Ваш проект'}
        zone={(project.zone as string) || 'Кухня'}
        run={offer.run}
        variantTitle={offer.variant.title}
        estimate={offer.estimate}
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
        disabledKeys={offer.disabled[offer.variant.key]}
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

  const catalogRead = await fetchCatalog(service, project.org_id as string);
  if (catalogRead.error !== null) {
    return (
      <OfferUnavailable
        org={(orgRow as Org | null) ?? null}
        reason="Проект сейчас не открывается: каталог компании не прочитался. Обновите страницу через минуту."
      />
    );
  }
  const catalog = catalogRead.entries;

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
