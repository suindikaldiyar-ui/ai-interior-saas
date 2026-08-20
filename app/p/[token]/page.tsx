import { notFound } from 'next/navigation';
import ClientPortal from '@/components/ClientPortal';
import { fetchCatalog } from '@/lib/catalog';
import { storageUrl } from '@/lib/supabase/config';
import { supabaseService } from '@/lib/supabase/server';
import { PROJECTS_BUCKET } from '@/lib/supabase/config';
import type { Org, ProjectSelections } from '@/types/catalog';
import type { FurnitureItem, RoomConfig } from '@/types/interior';

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
      'id, org_id, client_name, room, items, selections, status, liked_render_id',
    )
    .eq('share_token', params.token)
    .maybeSingle();

  if (!project) notFound();

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
