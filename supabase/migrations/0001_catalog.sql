-- InteriorAI Studio — фаза 3: каталог, проекты, мультиарендность.
--
-- Главное свойство схемы: НЕТ таблиц под кухни, ковры и двери по отдельности.
-- Есть одна catalog_items + поле applies_to. Как только появится вторая
-- специализированная таблица, платформа перестанет быть универсальной.

create extension if not exists "pgcrypto";

/* ─────────────────────────  Справочники  ───────────────────────── */

-- К чему товар применяется в сцене. Определяет, как он попадает в рендер.
create type applies_to_kind as enum (
  'floor',    -- покрывает поверхность пола
  'wall',     -- покрывает поверхность стены
  'ceiling',  -- покрывает потолок
  'zone',     -- занимает функциональную зону (гарнитур, шкаф-купе)
  'object',   -- отдельно стоящий предмет (диван, ковёр, стол)
  'opening'   -- встраивается в проём (дверь, окно, портал)
);

-- Единица измерения — тоже поле, а не хардкод.
create type catalog_unit as enum ('m2', 'piece', 'running_meter', 'set');

create type org_role as enum ('owner', 'manager', 'designer');

create type asset_kind as enum ('texture', 'swatch', 'composite', 'photo', 'model');

create type project_status as enum ('draft', 'in_progress', 'sent', 'approved', 'archived');

/* ─────────────────────────  Организации  ───────────────────────── */

create table orgs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  logo_url     text,
  accent_color text not null default '#3D8FD1',
  domain       text unique,
  plan         text not null default 'trial',
  created_at   timestamptz not null default now()
);

create table org_members (
  org_id  uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    org_role not null default 'designer',
  primary key (org_id, user_id)
);

create index org_members_user_idx on org_members(user_id);

/* ─────────────────────────  Каталог  ───────────────────────── */

create table catalog_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  key        text not null,
  name_ru    text not null,
  name_kk    text not null default '',
  applies_to applies_to_kind not null,
  unit       catalog_unit not null default 'm2',
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create index catalog_categories_org_idx on catalog_categories(org_id, sort_order);

create table catalog_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  category_id uuid not null references catalog_categories(id) on delete cascade,
  article     text not null,
  name_ru     text not null,
  name_kk     text not null default '',
  description text not null default '',
  price       numeric(12, 2) not null default 0,
  unit        catalog_unit not null default 'm2',
  -- для zone/object/opening: {width, height, depth} в метрах
  dimensions  jsonb not null default '{}'::jsonb,
  -- для floor/wall/ceiling: {moduleSize:[w,h], pattern:'herringbone'|'straight'|...}
  tiling      jsonb not null default '{}'::jsonb,
  meta        jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, article)
);

create index catalog_items_category_idx on catalog_items(category_id, is_active);
create index catalog_items_org_idx on catalog_items(org_id);

create table catalog_assets (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references catalog_items(id) on delete cascade,
  org_id       uuid not null references orgs(id) on delete cascade,
  kind         asset_kind not null,
  storage_path text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index catalog_assets_item_idx on catalog_assets(item_id, kind, sort_order);

/* ─────────────────────────  Проекты  ───────────────────────── */

create table projects (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  client_name       text not null default '',
  client_phone      text not null default '',
  room              jsonb not null default '{}'::jsonb,
  items             jsonb not null default '[]'::jsonb,
  source_photo_path text,
  measurements      jsonb not null default '{}'::jsonb,
  -- targetKey → catalog_item_id. Храним ССЫЛКУ, не копию товара:
  -- компания поменяла цену — проекты подтянут актуальную.
  selections        jsonb not null default '{}'::jsonb,
  status            project_status not null default 'draft',
  -- Длинный случайный токен, не последовательный id.
  share_token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  liked_render_id   uuid,
  liked_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index projects_org_idx on projects(org_id, updated_at desc);
create index projects_share_idx on projects(share_token);

create table renders (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  org_id              uuid not null references orgs(id) on delete cascade,
  style_id            text not null,
  selections_snapshot jsonb not null default '{}'::jsonb,
  image_path          text not null,
  duration_ms         int,
  created_at          timestamptz not null default now()
);

create index renders_project_idx on renders(project_id, created_at desc);

alter table projects
  add constraint projects_liked_render_fk
  foreign key (liked_render_id) references renders(id) on delete set null;

/* ─────────────────────────  RLS  ───────────────────────── */

alter table orgs               enable row level security;
alter table org_members        enable row level security;
alter table catalog_categories enable row level security;
alter table catalog_items      enable row level security;
alter table catalog_assets     enable row level security;
alter table projects           enable row level security;
alter table renders            enable row level security;

-- Членство текущего пользователя. security definer, чтобы политики на
-- org_members не рекурсировали сами в себя.
create or replace function public.is_org_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_members.org_id = target
      and org_members.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target uuid, roles org_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_members.org_id = target
      and org_members.user_id = auth.uid()
      and org_members.role = any(roles)
  );
$$;

create policy orgs_read on orgs
  for select using (public.is_org_member(id));

create policy orgs_update on orgs
  for update using (public.has_org_role(id, array['owner']::org_role[]));

create policy org_members_read on org_members
  for select using (user_id = auth.uid() or public.is_org_member(org_id));

create policy org_members_write on org_members
  for all using (public.has_org_role(org_id, array['owner']::org_role[]))
  with check (public.has_org_role(org_id, array['owner']::org_role[]));

-- Один и тот же приём для всех таблиц каталога и проектов:
-- видно и правится только то, что принадлежит своей организации.
create policy catalog_categories_all on catalog_categories
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy catalog_items_all on catalog_items
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy catalog_assets_all on catalog_assets
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy projects_all on projects
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy renders_all on renders
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

/* ── Кабинет клиента ──
   Анонимных политик здесь НЕТ намеренно. Страница /p/[token] читается на
   сервере сервисным ключом: он проверяет share_token сам и отдаёт наружу
   только те поля, которые клиенту положено видеть.

   Политика вида "share_token = current_setting(...)" выглядела бы защитой,
   но supabase-js не выставляет эту настройку сессии — она бы никогда не
   срабатывала и создавала ложное ощущение безопасности.

   Сам токен — 24 случайных байта (см. default выше), не последовательный id. */

/* ─────────────────────────  Storage  ───────────────────────── */

insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('projects', 'projects', true)
on conflict (id) do nothing;

-- Путь: {org_id}/{category_key}/{item_id}/{kind}.jpg — первый сегмент даёт org.
create policy catalog_objects_read on storage.objects
  for select using (bucket_id in ('catalog', 'projects'));

create policy catalog_objects_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('catalog', 'projects')
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy catalog_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('catalog', 'projects')
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy catalog_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('catalog', 'projects')
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

/* ─────────────────────────  updated_at  ───────────────────────── */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch
  before update on projects
  for each row execute function public.touch_updated_at();
