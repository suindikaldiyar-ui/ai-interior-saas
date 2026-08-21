-- Фотография помещения клиента как основа рендера.
--
-- До этой миграции рендер строился по пустой 3D-комнате из замера: у неё
-- нет ни окон клиента, ни его стен, и модель дорисовывала свои. Клиент
-- не узнавал квартиру, а узнавание — это половина продажи.

/** Главный снимок: путь в бакете проектов. Остальные лежат в meta.photos. */
alter table projects add column if not exists source_photo_path text;

/*
 * Все снимки замера: [{ path, name }]. Главный дублируется в
 * source_photo_path — по нему рендер берёт кадр без лишнего разбора json.
 */
alter table projects add column if not exists source_photos jsonb not null default '[]'::jsonb;
