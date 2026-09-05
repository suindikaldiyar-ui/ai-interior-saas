-- Учёт обращений к модели и квота демонстрационного доступа.
--
-- Две задачи одной таблицей:
--
--   1. ВИДНО, КТО СКОЛЬКО ТРАТИТ. Каждый запрос к модели — строка с
--      организацией, человеком, видом, статусом и стоимостью. До этого
--      расход был виден только в счёте провайдера, одной суммой.
--
--   2. КВОТА СЧИТАЕТСЯ ПО СОДЕРЖИМОМУ. Демо-организация рисует ровно один
--      раз, и «один раз» — это фактическая строка в этой таблице, а не
--      счётчик на организации. Счётчик забудут сбросить, он разойдётся
--      с реальностью, и компания либо получит вторую бесплатную картинку,
--      либо упрётся в отказ, ничего не отрисовав.

create table if not exists ai_generations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,

  /*
   * Кто запустил. NULL — сервисный скрипт (`npm run demo:render`):
   * демо-объект рисую я, и в квоту компании он не входит.
   */
  user_id    uuid references auth.users(id) on delete set null,

  -- 'render' | 'millwork' | 'spatial' | 'analyze_room'
  kind       text not null,

  /*
   * running    — место занято, модель ещё думает
   * succeeded  — картинка получена, квота потрачена
   * failed     — не получилось, место освобождается
   */
  status     text not null default 'running'
             check (status in ('running', 'succeeded', 'failed')),

  /*
   * ЗАНИМАЕТ ЛИ СТРОКА МЕСТО В КВОТЕ.
   *
   * Признак лежит В САМОЙ СТРОКЕ, а не выводится из тарифа при чтении:
   * тариф компании завтра поменяется, а уже потраченное обязано остаться
   * потраченным ровно тем, чем было в момент запроса.
   */
  counts_against_quota boolean not null default false,

  /*
   * Номер занятого места, 0…limit-1. Существует ради уникального индекса
   * ниже: без него «не больше одной» пришлось бы проверять в коде, а два
   * одновременных клика проходят такую проверку оба.
   */
  slot       int not null default 0,

  -- Стоимость-заглушка в микроцентах: настоящий прайс появится позже,
  -- а место под него нужно уже сейчас, иначе сумму не с чем сверять.
  cost_micros bigint not null default 0,

  duration_ms int,
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ai_generations_org_idx
  on ai_generations(org_id, created_at desc);

/*
 * ГОНКА ЗАКРЫВАЕТСЯ ЗДЕСЬ, А НЕ В КОДЕ.
 *
 * Двойной клик или два замерщика разом дают два запроса; проверка «сейчас
 * ноль, значит можно» проходит в обоих, и обе картинки уходят в модель.
 * Поэтому место РЕЗЕРВИРУЕТСЯ вставкой строки со статусом 'running' ДО
 * вызова модели, а этот индекс не даёт вставить вторую такую же: второй
 * запрос упирается в 23505 на уровне базы.
 *
 * `status <> 'failed'` в условии — это и есть «квота не сгорает на
 * неудаче»: упавшая генерация выпадает из индекса, и место снова свободно.
 * Успешная остаётся и держит место навсегда.
 */
create unique index if not exists ai_generations_quota_slot
  on ai_generations(org_id, kind, slot)
  where counts_against_quota and status <> 'failed';

alter table ai_generations enable row level security;

/*
 * ЧИТАТЬ — участникам своей организации. ПИСАТЬ — НИКОМУ.
 *
 * Политики на insert/update/delete здесь нет НАМЕРЕННО: будь она,
 * демо-компания удалила бы свою же строку и получила вторую генерацию.
 * Пишет только сервисный ключ из роута, где решение и принимается.
 */
create policy ai_generations_read on ai_generations
  for select using (public.is_org_member(org_id));
