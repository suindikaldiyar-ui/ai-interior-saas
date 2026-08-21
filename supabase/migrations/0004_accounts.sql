-- Из демонстрации в рабочий продукт: аккаунты, объекты, сохранение.
--
-- До этой миграции проект был витриной с зашитыми данными. Теперь реальный
-- человек заводит компанию и ведёт свои объекты, а демонстрация остаётся
-- публичной, но засевается тем же кодом, что и настоящие проекты.

/* ─────────────────────────  Организация  ───────────────────────── */

alter table orgs add column if not exists city text not null default '';
alter table orgs add column if not exists phone text not null default '';

-- Замерщик как роль добавлен в 0003_roles.sql: значение перечисления обязано
-- быть закоммичено раньше, чем оно встретится в `default` этой миграции.

/* ─────────────────────────  Приглашения  ───────────────────────── */

create table if not exists org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  email       text not null,
  role        org_role not null default 'surveyor',
  -- 24 случайных байта, как и share_token: последовательный id тут опасен.
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);

create index if not exists org_invites_org_idx on org_invites(org_id, created_at desc);

alter table org_invites enable row level security;

create policy org_invites_manage on org_invites
  for all using (public.has_org_role(org_id, array['owner', 'manager']::org_role[]))
  with check (public.has_org_role(org_id, array['owner', 'manager']::org_role[]));

/* ─────────────────────────  Объекты  ───────────────────────── */

alter table projects add column if not exists address text not null default '';
alter table projects add column if not exists zone text not null default 'Кухня';
alter table projects add column if not exists surveyor text not null default '';

/*
 * Состояние конфигуратора целиком: состав модулей по каждому варианту,
 * выбранный вариант, снимок цен и снятые галочки сметы.
 *
 * Открыть объект заново — он обязан восстановиться ровно в том виде,
 * в каком его закрыли. Поэтому храним не «параметры для пересчёта»,
 * а именно результат: пересчёт по изменившемуся каталогу дал бы другую
 * сумму, и подписанный документ разошёлся бы с показанным клиенту.
 */
alter table projects add column if not exists millwork jsonb not null default '{}'::jsonb;

/** Сумма выбранного варианта — чтобы список объектов не считал её на лету. */
alter table projects add column if not exists total numeric(12, 2) not null default 0;

create index if not exists projects_status_idx on projects(org_id, status);

/* ─────────────────────────  Каталог: ставки  ───────────────────────── */

/*
 * Ключ статьи сметы. Пока он не проставлен, товар в расчёт не попадает:
 * считать по выдуманным ставкам нельзя — это тот же плавающий прайс,
 * от которого защищает весь слой конфигуратора.
 */
create index if not exists catalog_items_estimate_key_idx
  on catalog_items ((meta ->> 'estimateKey'))
  where meta ? 'estimateKey';
