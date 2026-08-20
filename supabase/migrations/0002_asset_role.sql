-- Кухня — первая категория, которой мало одного файла на вид.
--
-- У гарнитура три разные поверхности с разными референсами: фасад,
-- столешница и фартук. Все три — texture/composite, поэтому одного поля kind
-- перестало хватать: вторая текстура затирала первую.
--
-- Заводим role. Отдельной таблицы под кухни по-прежнему НЕТ: та же
-- catalog_assets, просто с уточнением, какая это поверхность товара.

alter table catalog_assets
  add column if not exists role text not null default 'main';

-- Один файл на связку товар + вид + поверхность.
create unique index if not exists catalog_assets_slot_idx
  on catalog_assets (item_id, kind, role);

comment on column catalog_assets.role is
  'Какая поверхность товара: main | facade | countertop | backsplash. Для покрытий — main.';
