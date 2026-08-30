-- Библиотека планировок ЖК.
--
-- Застройщики сдают дома сериями: в одном ЖК сотни одинаковых квартир.
-- Один замер работает на все, а у компании появляется актив, которого нет
-- у конкурента. Библиотека принадлежит ОРГАНИЗАЦИИ: org_id обязателен
-- везде, публичное чтение идёт сервисным ключом и только по нужным полям —
-- тем же приёмом, что кабинет клиента /p/[token].

/* ─────────────────────────  Жилые комплексы  ───────────────────────── */

create table if not exists complexes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  -- Слаг — часть адреса рекламной страницы: /zk/atamura-urpaq-2
  slug        text not null,
  name        text not null,
  developer   text not null default '',
  city        text not null default '',
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, slug)
);

create index if not exists complexes_org_idx on complexes(org_id, name);

/* ─────────────────────────  Планировки  ───────────────────────── */

create table if not exists floor_plans (
  id               uuid primary key default gen_random_uuid(),
  complex_id       uuid not null references complexes(id) on delete cascade,
  slug             text not null,
  code             text not null,
  rooms            int not null default 1,
  area_m2          numeric(7, 2) not null default 0,
  /*
   * Площади комнат из объявления застройщика: [{ name, areaM2 }].
   * Это НЕ замер: кухня 11.85 м² бывает и 3200×3700, и 2900×4100,
   * а смету считает длина ряда.
   */
  room_areas       jsonb not null default '[]'::jsonb,
  -- Своя схема, а не скачанная у застройщика.
  scheme_path      text,

  /*
   * Замеры по зонам: [{ zone, measurement, notes }]. Пусто — планировка
   * заведена, но не обмерена: страница работает, размеров и цен нет.
   * Отдельного флага «обмерена» НЕТ намеренно — его забудут переключить,
   * и продукт начнёт обещать проекты, которых не существует.
   */
  zones            jsonb not null default '[]'::jsonb,
  measured_at      timestamptz,
  measured_by      text,
  -- Честность: на какой именно квартире снят замер.
  source_apartment text,
  -- У одинаковых квартир стены гуляют. Допуск назван и виден клиенту.
  tolerance_mm     int not null default 30,
  is_public        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (complex_id, slug)
);

create index if not exists floor_plans_complex_idx on floor_plans(complex_id, code);

/* ─────────────────────────  Готовые проекты  ───────────────────────── */

create table if not exists ready_projects (
  id             uuid primary key default gen_random_uuid(),
  floor_plan_id  uuid not null references floor_plans(id) on delete cascade,
  zone           text not null,
  title          text not null,
  -- Ряд целиком, а не «параметры для пересчёта»: цена обязана совпасть
  -- с той, что показали клиенту, даже после переоценки каталога.
  run            jsonb not null default '{}'::jsonb,
  price_snapshot jsonb not null default '{}'::jsonb,
  total          numeric(12, 2) not null default 0,
  render_path    text,
  is_public      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists ready_projects_plan_idx
  on ready_projects(floor_plan_id, zone, created_at desc);

/* ─────────────────────────  Заявки  ───────────────────────── */

/*
 * Заявка с публичной страницы. Пишется в базу ДО отправки в Telegram:
 * упавший телеграм не должен стоить компании лида — это живой человек,
 * который оставил номер и ждёт звонка.
 */
create table if not exists plan_leads (
  id            uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null references floor_plans(id) on delete cascade,
  name          text not null default '',
  phone         text not null,
  comment       text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists plan_leads_plan_idx on plan_leads(floor_plan_id, created_at desc);

/* ─────────────────────────  RLS  ───────────────────────── */

alter table complexes enable row level security;
alter table floor_plans enable row level security;
alter table ready_projects enable row level security;
alter table plan_leads enable row level security;

-- Тот же приём, что у каталога и проектов: видно только своё.
create policy complexes_all on complexes
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy floor_plans_all on floor_plans
  for all using (
    exists (
      select 1 from complexes c
      where c.id = floor_plans.complex_id and public.is_org_member(c.org_id)
    )
  )
  with check (
    exists (
      select 1 from complexes c
      where c.id = floor_plans.complex_id and public.is_org_member(c.org_id)
    )
  );

create policy ready_projects_all on ready_projects
  for all using (
    exists (
      select 1 from floor_plans p
      join complexes c on c.id = p.complex_id
      where p.id = ready_projects.floor_plan_id and public.is_org_member(c.org_id)
    )
  )
  with check (
    exists (
      select 1 from floor_plans p
      join complexes c on c.id = p.complex_id
      where p.id = ready_projects.floor_plan_id and public.is_org_member(c.org_id)
    )
  );

create policy plan_leads_read on plan_leads
  for select using (
    exists (
      select 1 from floor_plans p
      join complexes c on c.id = p.complex_id
      where p.id = plan_leads.floor_plan_id and public.is_org_member(c.org_id)
    )
  );

/*
 * Анонимных политик здесь нет намеренно. Публичная страница читает
 * сервисным ключом и отбирает ТОЛЬКО нужные поля — как /p/[token].
 * Политика «select using (is_public)» отдала бы анониму строку целиком,
 * вместе с org_id и снимком цен.
 */

/* ─────────────────────────  Схемы планировок  ───────────────────────── */

insert into storage.buckets (id, name, public)
values ('plans', 'plans', true)
on conflict (id) do nothing;

-- Путь: {org_id}/{complex_id}/{plan_id}.jpg — первый сегмент даёт org.
create policy plans_objects_read on storage.objects
  for select using (bucket_id = 'plans');

create policy plans_objects_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'plans'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy plans_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'plans'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy plans_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'plans'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

/* ─────────────────────────  Связь с объектом  ───────────────────────── */

/*
 * Объект, собранный по библиотечной планировке, помнит её: по этому полю
 * видно, откуда пришли размеры, и его же читает список «готовые проекты
 * для этой квартиры».
 */
alter table projects add column if not exists floor_plan_id uuid
  references floor_plans(id) on delete set null;

create index if not exists projects_floor_plan_idx on projects(floor_plan_id);
