-- Размеры со схемы планировки.
--
-- Схема застройщика — масштабный чертёж, а площади комнат в объявлении
-- известны до сотой. Значит масштаб выводится из них, а из масштаба —
-- длина любой стены. Это НЕ замер: предварительный проект и предварительная
-- цена в тот же день, когда планировку завели.

/*
 * Масштаб: { mmPerPx, basisRoom, basisAreaM2, basisPolygon, calibratedAt }.
 * Пусто — размеров со схемы нет, и цены тоже нет: цена без длины ряда
 * это выдуманное число.
 */
alter table floor_plans
  add column if not exists calibration jsonb;

/*
 * Стены, снятые со схемы: [{ zone, from, to, lengthMm, openings }].
 * Лежат ОТДЕЛЬНО от `zones` намеренно: `zones` означает «обмерена
 * замерщиком», и смешивать эти два состояния нельзя — иначе продукт
 * начнёт обещать точность, которой у обводки нет.
 */
alter table floor_plans
  add column if not exists derived_walls jsonb not null default '[]'::jsonb;

comment on column floor_plans.calibration is
  'Масштаб схемы: мм в пикселе, комната-основание и её контур.';
comment on column floor_plans.derived_walls is
  'Стены, выведенные со схемы. Это не замер: допуск 100 мм, а не 30.';

/* ─────────────────────  Автопроект  ───────────────────── */

/*
 * Собран автоматически по размерам со схемы. Стартовая точка, а не финал:
 * ручной проект замерщика всегда главнее и вытесняет автоматический.
 */
alter table ready_projects
  add column if not exists is_auto boolean not null default false;

/** Откуда размеры проекта: 'survey' — замер квартиры, 'scheme' — схема. */
alter table ready_projects
  add column if not exists size_source text;

/*
 * На зону не больше ОДНОГО автопроекта: выбор из трёх выдуманных вариантов
 * хуже одного честного. Ручных это не касается — их ограничивает
 * MAX_READY_PER_ZONE в коде.
 */
create unique index if not exists ready_projects_auto_zone_idx
  on ready_projects(floor_plan_id, zone)
  where is_auto;
