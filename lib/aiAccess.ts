import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_QUOTA_SPENT, isDemoPlan } from './plan';
import { currentOrg, supabaseServer, supabaseService } from './supabase/server';

/**
 * ДОСТУП К МОДЕЛИ И КВОТА ДЕМОНСТРАЦИОННОГО ДОСТУПА.
 *
 * Демо-организация должна ПРОЙТИ ПУТЬ ЗАМЕРЩИКА ЦЕЛИКОМ и увидеть
 * визуализацию своими руками — одного раза достаточно, чтобы понять,
 * за что платят. Поэтому не «выключено», а «ровно один раз».
 *
 * Три правила, каждое существует против конкретной поломки:
 *
 *   1. КВОТА СЧИТАЕТСЯ ПО СОДЕРЖИМОМУ — по фактическим строкам
 *      `ai_generations`, а не по счётчику на организации. Счётчик забудут
 *      сбросить, и он разойдётся с реальностью в обе стороны сразу.
 *   2. ПРОВЕРКА НА СЕРВЕРЕ И ДО ВЫЗОВА МОДЕЛИ. Спрятанная кнопка — это
 *      подсказка пользователю, а не защита кошелька.
 *   3. МЕСТО РЕЗЕРВИРУЕТСЯ ВСТАВКОЙ, а не проверяется чтением. Два клика
 *      подряд проходят проверку «сейчас ноль» оба; уникальный индекс
 *      `ai_generations_quota_slot` роняет второй на уровне базы.
 */

/** Виды обращений к модели. Пишутся в `ai_generations.kind`. */
export type GenerationKind = 'render' | 'millwork' | 'spatial' | 'analyze_room';

/**
 * Сколько РАЗНЫХ обращений каждого вида даётся демо-организации.
 *
 * Квота есть только у визуализации: это то, что компания приходит увидеть,
 * и то, что стоит денег за каждую картинку. Виды без записи здесь остаются
 * закрытыми наглухо — путь замерщика через них не идёт.
 */
export const DEMO_QUOTA: Partial<Record<GenerationKind, number>> = {
  render: 1,
};

/** Стоимость-заглушка, микроценты. Настоящий прайс появится позже. */
const COST_MICROS: Record<GenerationKind, number> = {
  render: 40_000,
  millwork: 500,
  spatial: 800,
  analyze_room: 1_200,
};

/** Человеческое название вида — для текста отказа. */
const KIND_RU: Record<GenerationKind, string> = {
  render: 'визуализация',
  millwork: 'изменение состава голосом',
  spatial: 'расстановка сцены',
  analyze_room: 'разбор фотографии помещения',
};

/* Тексты для покупателя живут в `lib/plan.ts`: их читает и кнопка в браузере. */
export { DEMO_QUOTA_HINT, DEMO_QUOTA_SPENT } from './plan';

/* ─────────────────────────  Учёт  ───────────────────────── */

/**
 * Сколько мест квоты уже занято.
 *
 * Занятыми считаются `running` и `succeeded`: пока модель думает, место
 * держится, а упавшая генерация из счёта выпадает — квота не сгорает.
 * Строки сервисного скрипта (`counts_against_quota = false`) не считаются
 * вовсе: демо-объект рисую я, а не компания.
 */
export async function demoQuotaUsed(
  service: SupabaseClient,
  orgId: string,
  kind: GenerationKind,
): Promise<number> {
  const { count } = await service
    .from('ai_generations')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('kind', kind)
    .eq('counts_against_quota', true)
    .neq('status', 'failed');

  return count ?? 0;
}

/**
 * Квота визуализации израсходована — для интерфейса.
 *
 * Читается на сервере при открытии объекта, чтобы кнопка приходила уже
 * в правильном виде. Не защита: защита в `reserveGeneration`.
 */
export async function demoRenderSpent(orgId: string, plan: string): Promise<boolean> {
  if (!isDemoPlan(plan)) return false;
  const service = supabaseService();
  if (!service) return false;
  return (await demoQuotaUsed(service, orgId, 'render')) >= (DEMO_QUOTA.render ?? 0);
}

/* ─────────────────────────  Резервирование  ───────────────────────── */

export type GenerationTicket = {
  /**
   * Закрыть место: успех держит его навсегда, неудача освобождает.
   * Вызывать обязательно — иначе строка навсегда останется `running`
   * и съест квоту у компании, которая ничего не получила.
   */
  settle(ok: boolean, info?: { durationMs?: number; error?: string }): Promise<void>;
};

export type GenerationGate =
  | { denied: NextResponse; ticket?: undefined }
  | { denied?: undefined; ticket: GenerationTicket | null };

/** Место закрывать нечего: организации нет или тариф без ограничений. */
const FREE: GenerationGate = { ticket: null };

/**
 * Резервирование места ДО вызова модели.
 *
 * Возвращает `denied` — запрос дальше не идёт; `ticket` — идёт, и его
 * обязательно закрыть. `ticket: null` означает «ограничений нет вовсе»:
 *
 *   организации нет                  → пропускаем (роуты сессии не требуют)
 *   тариф не demo                     → пропускаем, ни одной записи, ни одного
 *                                       лишнего запроса к базе
 *   demo, вид без квоты               → отказ, как было
 *   demo, место свободно              → строка 'running', вперёд
 *   demo, место занято                → отказ фразой для покупателя
 *   demo, место занял кто-то в эту же
 *   миллисекунду                      → 23505 из базы, тот же отказ
 */
export async function reserveGeneration(kind: GenerationKind): Promise<GenerationGate> {
  const org = await currentOrg();

  /*
   * Ни одной строки ниже не выполняется для обычной организации. Это и есть
   * условие «мой путь не тронут»: тариф проверяется ЯВНЫМ РАВЕНСТВОМ
   * `plan === 'demo'` (см. `isDemoPlan`), а не «не trial», поэтому trial,
   * pro, пустая строка и null проходят здесь насквозь.
   */
  if (!org || !isDemoPlan(org.plan)) return FREE;

  const limit = DEMO_QUOTA[kind] ?? 0;
  if (limit <= 0) {
    return {
      denied: NextResponse.json(
        {
          error:
            `В демонстрационном доступе ${KIND_RU[kind]} не запускается. ` +
            'Полный доступ — без ограничений, обсудим на встрече.',
          code: 'demo_plan',
        },
        { status: 403 },
      ),
    };
  }

  const service = supabaseService();
  if (!service) {
    /*
     * Сервисного ключа нет — квоту не посчитать и место не занять.
     * Отказываем: пропустить значило бы отдать демо-организации
     * безлимитную генерацию при первой же неполной настройке окружения.
     */
    return {
      denied: NextResponse.json(
        { error: 'Учёт демо-доступа не настроен на сервере.', code: 'demo_quota_unavailable' },
        { status: 503 },
      ),
    };
  }

  const supabase = supabaseServer();
  const userId = supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null;

  /*
   * Занимаем первое свободное место. Свободное — это то, на которое
   * прошла ВСТАВКА; спрашивать «сколько занято» и потом вставлять нельзя,
   * между двумя запросами и живёт гонка.
   */
  for (let slot = 0; slot < limit; slot += 1) {
    const { data, error } = await service
      .from('ai_generations')
      .insert({
        org_id: org.id,
        user_id: userId,
        kind,
        status: 'running',
        counts_against_quota: true,
        slot,
        cost_micros: COST_MICROS[kind],
      })
      .select('id')
      .single();

    if (!error && data) {
      const id = String(data.id);
      return {
        ticket: {
          async settle(ok, info) {
            await service
              .from('ai_generations')
              .update({
                status: ok ? 'succeeded' : 'failed',
                duration_ms: info?.durationMs ?? null,
                error: ok ? null : (info?.error ?? 'без картинки'),
                finished_at: new Date().toISOString(),
                // Неудачная попытка ничего не стоила — и в расходе её нет.
                cost_micros: ok ? COST_MICROS[kind] : 0,
              })
              .eq('id', id);
          },
        },
      };
    }

    // 23505 — место занято прямо сейчас. Пробуем следующее.
    if (error?.code !== '23505') {
      return {
        denied: NextResponse.json(
          { error: `Не удалось учесть обращение: ${error?.message ?? 'нет данных'}` },
          { status: 500 },
        ),
      };
    }
  }

  return {
    denied: NextResponse.json(
      { error: DEMO_QUOTA_SPENT, code: 'demo_quota_spent' },
      { status: 403 },
    ),
  };
}

/**
 * Жёсткий отказ без квоты — для видов, которых в демонстрации нет вовсе.
 *
 * Оставлен отдельной функцией намеренно: роуты, где квоты не предполагается,
 * не должны заводить строку учёта и трогать резервирование.
 */
export async function generationBlocked(what: string): Promise<NextResponse | null> {
  const org = await currentOrg();
  if (!org || !isDemoPlan(org.plan)) return null;

  return NextResponse.json(
    {
      error:
        `В демонстрационном доступе ${what} не запускается. ` +
        'Полный доступ — без ограничений, обсудим на встрече.',
      code: 'demo_plan',
    },
    { status: 403 },
  );
}
