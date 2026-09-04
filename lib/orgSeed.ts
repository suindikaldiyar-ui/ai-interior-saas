import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCatalog, seedTypicalCatalog, type SeedResult } from './catalog';
import { DEMO_SEED_KEY, buildDemoProject } from './millwork/demoProject';
import { missingRequiredRates, ratesFromCatalog } from './millwork/rates';

/**
 * ЧТО ПОЛУЧАЕТ НОВАЯ ОРГАНИЗАЦИЯ.
 *
 * Ровно две вещи, и обе против одной и той же поломки — пустого продукта:
 *
 *   1. Заполненный каталог: смета считает по ставкам организации, и без них
 *      она показывает нули. Компания на демонстрации видит нули и решает,
 *      что продукт не работает.
 *   2. Один готовый объект: замер, решение, состав, чертёж, смета. Открыть
 *      и смотреть, ничего не вводя и ничего не генерируя.
 *
 * ПИШЕТСЯ СЕРВИСНЫМ КЛЮЧОМ. Членство пользователя создаётся в той же
 * последовательности, что и организация, и полагаться на то, что RLS уже
 * видит нового участника, здесь незачем: политика отсечёт вставку, и
 * организация останется пустой ровно в том сценарии, ради которого сид
 * и написан.
 *
 * ИДЕМПОТЕНТНОСТЬ ПРОВЕРЯЕТСЯ ПО СОДЕРЖИМОМУ, а не по флагу: каталог
 * смотрит на существующие артикулы, демо-объект — на существующую строку
 * с `millwork.demoSeed`. Булев флаг на организации забудут переключить,
 * и она окажется пустой при бодром «уже засеяно».
 */

export type DemoSeedResult = {
  /** Объект создан именно сейчас. Повторный вызов вернёт false. */
  created: boolean;
  projectId?: string;
  /** Сумма сметы демо-объекта: ноль здесь означает несработавший прайс. */
  total?: number;
  error?: string;
};

export type OrgSeedResult = {
  catalog: SeedResult;
  demo: DemoSeedResult;
};

/**
 * Демо-объект организации.
 *
 * Ставки берутся ИЗ КАТАЛОГА ЭТОЙ ОРГАНИЗАЦИИ, а не из кода: страница
 * объекта пересчитывает смету по каталогу на момент открытия, и посчитай
 * мы демо по своим числам — сумма в списке объектов разошлась бы с суммой
 * внутри объекта. Обе видны одному человеку одновременно.
 *
 * Без обязательных ставок объект не создаётся вовсе: демонстрация с нулями
 * хуже её отсутствия — она выглядит как сломанный расчёт, а не как пустая
 * организация.
 */
export async function seedDemoProject(
  supabase: SupabaseClient,
  orgId: string,
): Promise<DemoSeedResult> {
  const { data: already, error: probeError } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', orgId)
    .eq('millwork->>demoSeed', DEMO_SEED_KEY)
    .limit(1);

  if (probeError) {
    return { created: false, error: `Нет доступа к объектам: ${probeError.message}` };
  }
  if (already && already.length > 0) {
    return { created: false, projectId: String(already[0].id) };
  }

  const rates = ratesFromCatalog(await fetchCatalog(supabase, orgId));
  const missing = missingRequiredRates(rates);
  if (missing.length > 0) {
    return {
      created: false,
      error:
        `Демо-объект не создан: в каталоге нет ставок ${missing.join(', ')}. ` +
        'Смета показала бы нули вместо цен.',
    };
  }

  let demo: ReturnType<typeof buildDemoProject>;
  try {
    demo = buildDemoProject(rates);
  } catch (e) {
    return { created: false, error: e instanceof Error ? e.message : String(e) };
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      address: demo.address,
      zone: demo.zone,
      client_name: demo.clientName,
      client_phone: demo.clientPhone,
      surveyor: demo.surveyor,
      measurements: demo.measurement,
      millwork: demo.millwork,
      total: demo.total,
      // Замер внесён и состав собран — объект стоит в расчёте, как обычный.
      status: 'in_progress',
    })
    .select('id')
    .single();

  if (error || !data) {
    return { created: false, error: `Не удалось создать демо-объект: ${error?.message ?? 'нет данных'}` };
  }

  return { created: true, projectId: String(data.id), total: demo.total };
}

/**
 * Каталог и демо-объект одним вызовом. Порядок обязателен: демо-объект
 * считается по ставкам каталога, поэтому прайс ложится первым.
 *
 * Ошибка сида НЕ РОНЯЕТ создание организации: без каталога она работает,
 * а без организации не работает ничего. Результат уходит в ответ, чтобы
 * поломка была видна, а не молчала.
 */
export async function seedOrg(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgSeedResult> {
  const catalog = await seedTypicalCatalog(supabase, orgId);
  if (catalog.error) {
    return {
      catalog,
      demo: { created: false, error: 'Демо-объект не создан: каталог не заполнен.' },
    };
  }

  return { catalog, demo: await seedDemoProject(supabase, orgId) };
}
