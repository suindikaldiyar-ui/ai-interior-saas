'use client';

import { useEffect } from 'react';
import { fetchCatalog } from '@/lib/catalog';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useInteriorStore } from '@/store/useInteriorStore';

/**
 * Подтягивает каталог организации в стор. Ничего не рендерит.
 *
 * Организацию определяет сам, чтобы студия осталась клиентским компонентом.
 * Без Supabase или без входа просто молчит: сцена, чат и рендер по стилям
 * от каталога не зависят и обязаны работать.
 */
export default function CatalogLoader() {
  const setCatalog = useInteriorStore((s) => s.setCatalog);
  const setOrgId = useInteriorStore((s) => s.setOrgId);

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    let cancelled = false;

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || cancelled) return;

      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', userData.user.id)
        .limit(1);

      const orgId = membership?.[0]?.org_id as string | undefined;
      if (!orgId || cancelled) return;

      setOrgId(orgId);
      const catalog = await fetchCatalog(supabase, orgId);
      if (!cancelled) setCatalog(catalog);
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [setCatalog, setOrgId]);

  return null;
}
