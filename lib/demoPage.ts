import { estimateGroups, type EstimateGroup } from './millwork/estimateGroups';
import { buildEstimate } from './millwork/estimate';
import { DEMO_SEED_KEY } from './millwork/demoProject';
import { orgBySlug } from './org';
import type { MillworkState } from './projects';
import { PROJECTS_BUCKET, storageUrl } from './supabase/config';
import { supabaseService } from './supabase/server';
import type { Org } from '@/types/catalog';
import type { Estimate, Run } from '@/types/millwork';

/**
 * ДАННЫЕ ПУБЛИЧНОЙ ДЕМО-СТРАНИЦЫ.
 *
 * Страница открыта миру, поэтому здесь действуют правила публичных страниц
 * планировок целиком:
 *
 *   — читаем СЕРВИСНЫМ ключом и ПО СПИСКУ ПОЛЕЙ. Анонимных политик у
 *     `projects` нет, а `select *` отдал бы наружу телефон клиента и
 *     всё, что появится в таблице завтра;
 *   — читаем СТРОГО ОДИН объект СТРОГО ОДНОЙ организации, найденной по
 *     слагу из адреса. Ни один запрос здесь не ходит без `eq('org_id')`:
 *     на этом держится изоляция, и другой защиты у страницы нет;
 *   — НИЧЕГО НЕ ГЕНЕРИРУЕМ. Картинка либо уже лежит в Storage, либо её
 *     нет, и блок честно пуст.
 */

/** Только те поля объекта, которым место на публичной странице. */
const DEMO_PROJECT_FIELDS = 'id, address, zone, total, share_token, millwork';

export type DemoPageData = {
  org: Org;
  /** Адрес объекта. Имя и телефон клиента наружу не выходят вовсе. */
  address: string;
  zone: string;
  run: Run;
  estimate: Estimate;
  groups: EstimateGroup[];
  /** Кабинет клиента: та же ссылка, что компания отправляет своему клиенту. */
  shareToken: string;
  /** Готовая визуализация или null — второго состояния нет. */
  renderUrl: string | null;
};

export async function loadDemoPage(slug: string): Promise<DemoPageData | null> {
  const org = await orgBySlug(slug);
  if (!org) return null;

  const service = supabaseService();
  if (!service) return null;

  const { data } = await service
    .from('projects')
    .select(DEMO_PROJECT_FIELDS)
    .eq('org_id', org.id)
    .eq('millwork->>demoSeed', DEMO_SEED_KEY)
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const millwork = (data.millwork ?? {}) as MillworkState;
  const variant = millwork.selectedVariant ?? 'optimal';
  const run = millwork.runs?.[variant];
  if (!run) return null;

  /*
   * Смета считается ТЕМ ЖЕ `buildEstimate` и по СНИМКУ ЦЕН из объекта, а не
   * по каталогу на сегодня: страница показывает ту сумму, которую компании
   * назвали, и переоценка каталога её менять не должна.
   */
  const estimate = buildEstimate(run, variant, millwork.priceSnapshot ?? {}, [], millwork.savedAt);

  return {
    org,
    address: String(data.address ?? ''),
    zone: String(data.zone ?? ''),
    run,
    estimate,
    groups: estimateGroups(estimate),
    shareToken: String(data.share_token ?? ''),
    renderUrl: millwork.demoRender?.path
      ? storageUrl(PROJECTS_BUCKET, millwork.demoRender.path)
      : null,
  };
}
