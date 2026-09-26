'use client';

import { useEffect } from 'react';
import { CATALOG_READ_ERROR, fetchCatalog } from '@/lib/catalog';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useInteriorStore } from '@/store/useInteriorStore';

/**
 * Подтягивает каталог организации в стор. Ничего не рендерит.
 *
 * Организацию определяет сам, чтобы студия осталась клиентским компонентом.
 * Без Supabase или без входа просто молчит: сцена, чат и рендер по стилям
 * от каталога не зависят и обязаны работать.
 *
 * НЕ ПРОЧИТАЛСЯ — НЕ МОЛЧИТ (слой 52). Здесь стоял `.catch(() => undefined)`:
 * упавшее чтение оставляло каталог пустым, и панель материалов показывала
 * коллекции «ждёт импорта», а смета — фасады RAL по ставке цеха. Теперь
 * в стор уходят слова (`catalogError`), причина — в консоль.
 */
export default function CatalogLoader() {
  const setCatalog = useInteriorStore((s) => s.setCatalog);
  const setCatalogError = useInteriorStore((s) => s.setCatalogError);
  const setOrgId = useInteriorStore((s) => s.setOrgId);

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    let cancelled = false;

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || cancelled) return;

      const { data: membership, error: membershipError } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', userData.user.id)
        .limit(1);

      if (membershipError) {
        console.error('[каталог] организация не определилась:', membershipError.message);
        if (!cancelled) setCatalogError(CATALOG_READ_ERROR);
        return;
      }

      const orgId = membership?.[0]?.org_id as string | undefined;
      if (!orgId || cancelled) return;

      setOrgId(orgId);
      const read = await fetchCatalog(supabase, orgId);
      if (cancelled) return;
      if (read.error !== null) setCatalogError(read.error);
      else setCatalog(read.entries);
    })().catch((error: unknown) => {
      console.error('[каталог] загрузка упала:', error);
      if (!cancelled) setCatalogError(CATALOG_READ_ERROR);
    });

    return () => {
      cancelled = true;
    };
  }, [setCatalog, setCatalogError, setOrgId]);

  return null;
}
