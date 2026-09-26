import { estimateGroups, type EstimateGroup } from './millwork/estimateGroups';
import { DEMO_SEED_KEY } from './millwork/demoProject';
import { projectOffer } from './millwork/objectEstimate';
import { fetchCatalog } from './catalog';
import { orgBySlug } from './org';
import type { MillworkState } from './projects';
import { PROJECTS_BUCKET, storageUrl } from './supabase/config';
import { supabaseService } from './supabase/server';
import { productionSettings, type Org } from '@/types/catalog';
import type { Estimate, Measurement, Run } from '@/types/millwork';

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

/**
 * Только те поля объекта, которым место на публичной странице.
 *
 * `measurements` наружу не выходит: он нужен смете (длина стены,
 * потолок, проёмы) — той же, что у экрана дизайнера и кабинета клиента.
 */
const DEMO_PROJECT_FIELDS = 'id, address, zone, total, share_token, millwork, measurements';

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

/**
 * Страница есть, но показать её сейчас нельзя — словами. Не 404: адрес
 * верный, а «страницы не существует» отправит человека искать другую.
 */
export type DemoPageUnavailable = { unavailable: string };

export async function loadDemoPage(slug: string): Promise<DemoPageData | DemoPageUnavailable | null> {
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
  if (!millwork.runs?.[variant]) return null;

  /*
   * СМЕТА — ТЕМИ ЖЕ ШАГАМИ, ЧТО У ЭКРАНА ДИЗАЙНЕРА И КАБИНЕТА (слой 52).
   *
   * Здесь был свой `buildEstimate` по снимку цен: без позиций каталога,
   * без фрезеровки и декоров корпуса, без настроек цеха и со снятыми
   * галочками, которых он не видел. Теперь это `projectOffer`: каталог
   * организации даёт строки, снимок цен держит сумму, которую назвали —
   * переоценка каталога её не меняет (ловушка 30).
   *
   * Каталог не прочитался или раскладка не собралась — страницы нет:
   * цена без каталога — это цифра, которую компания не подпишет, а
   * причина уходит в лог.
   */
  const [catalogRead, { data: orgRow, error: orgError }] = await Promise.all([
    fetchCatalog(service, org.id),
    service.from('orgs').select('production').eq('id', org.id).maybeSingle(),
  ]);
  if (catalogRead.error !== null) {
    return { unavailable: 'Демонстрация сейчас не открывается: каталог компании не прочитался. Обновите страницу через минуту.' };
  }
  if (orgError) {
    console.error(`[демо-страница] ${org.slug}: настройки цеха не прочитались —`, orgError.message);
    return { unavailable: 'Демонстрация сейчас не открывается: настройки цеха не прочитались. Обновите страницу через минуту.' };
  }

  const offer = projectOffer({
    title: String(data.address ?? ''),
    zone: String(data.zone ?? ''),
    measurement: data.measurements as Measurement,
    state: millwork,
    production: productionSettings(orgRow?.production),
    catalog: catalogRead.entries,
  });
  if (offer.state === 'refused') {
    console.error(`[демо-страница] ${org.slug}: раскладка не собралась — ${offer.refusal}`);
    return { unavailable: `Демонстрация сейчас не собирается: ${offer.refusal}` };
  }
  const { run, estimate } = offer;

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
