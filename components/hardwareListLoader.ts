'use client';

import { useInteriorStore } from '@/store/useInteriorStore';
import { HARDWARE_LIST_ERROR } from '@/lib/catalog';

/**
 * СПИСОК ФУРНИТУРЫ ПРОИЗВОДИТЕЛЕЙ — ПО ТРЕБОВАНИЮ (ТЗ 2026-10-31, § 21).
 *
 * Зовут те, кому нужен список целиком: панель «Фурнитура» и выбор
 * направляющих ящиков отсека. Одно чтение на вкладку: идёт — второй вызов
 * ждёт его же; прочитан — повторно не читается; не прочитался — повтор по
 * нажатию. Строки ложатся в каталог стора рядом с позициями компании
 * (`mergeCatalogEntries`): полная строка поставленной позиции лёгкой не
 * заменяется. Supabase и чтение — динамическим импортом: в первую загрузку
 * экрана они не едут.
 */
let inFlight: Promise<void> | null = null;

export function ensureHardwareList(force = false): Promise<void> {
  const store = useInteriorStore.getState();
  if (inFlight) return inFlight;
  if (!force && store.hardwareList.state === 'ready') return Promise.resolve();
  const orgId = store.orgId;
  if (!orgId) return Promise.resolve();
  store.setHardwareList({ state: 'loading', read: 0, total: null, error: null });
  inFlight = (async () => {
    try {
      const [{ supabaseBrowser }, { fetchHardwareList }] = await Promise.all([import('@/lib/supabase/client'), import('@/lib/catalog')]);
      const supabase = supabaseBrowser();
      if (!supabase) {
        useInteriorStore.getState().setHardwareList({ state: 'error', error: HARDWARE_LIST_ERROR });
        return;
      }
      const read = await fetchHardwareList(supabase, orgId, (n, total) => useInteriorStore.getState().setHardwareList({ read: n, total }));
      if (read.error !== null) {
        useInteriorStore.getState().setHardwareList({ state: 'error', error: read.error });
        return;
      }
      useInteriorStore.getState().mergeCatalogEntries(read.entries);
      useInteriorStore.getState().setHardwareList({ state: 'ready', read: read.entries.length, total: read.entries.length, error: null });
    } catch (error) {
      console.error('[каталог] список фурнитуры производителей: загрузка упала —', error);
      useInteriorStore.getState().setHardwareList({ state: 'error', error: HARDWARE_LIST_ERROR });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
