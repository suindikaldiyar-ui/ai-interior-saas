-- ПОДГОТОВЛЕНО, НЕ ПРИМЕНЕНО (ТЗ 2026-10-31, P0 «надёжность каталога»).
-- Применять только по отдельному разрешению владельца; на production — в окно
-- обслуживания: добавление хранимой колонки переписывает таблицу catalog_items.
--
-- Зачем. Studio читает позиции производителей «лёгкими» — 29 путей
-- meta->hardware-><поле> (lib/catalog.ts, HARDWARE_LIGHT_FIELDS). Замер под
-- пользователем (RLS), 5264 позиции: страница 1000 строк холодная 15–27 с,
-- прогретая 4–5 с; шесть страниц разом холодными — 83,5 с с двумя обрывами
-- «canceling statement due to statement timeout». Время — у базы: каждый путь
-- заново распаковывает тяжёлый meta (в фактах лёгкие поля — 25 % байт записи
-- изделия; notes, drilling, printed и missing — 66 %).
--
-- Что делает. Хранимая колонка с записью изделия БЕЗ тяжёлых полей паспорта:
-- распаковка один раз при записи, чтение — одной колонкой. Список тяжёлых
-- полей — вычитание, а не перечень лёгких: новое поле фактов попадает в лёгкую
-- запись само (запись тяжелеет, но не теряет того, что читает Studio).
-- Источник правды прежний — meta.hardware; колонка выводится базой и руками
-- не пишется (GENERATED ALWAYS), разойтись с meta не может.
--
-- Чтение в коде переключается ПОСЛЕ применения: пока колонки нет, PostgREST
-- уронил бы запрос целиком (ловушка 144) — путь чтения в этом заходе не тронут.

alter table public.catalog_items
  add column if not exists meta_hardware_light jsonb
  generated always as (
    (meta -> 'hardware')
      - array['notes', 'drilling', 'printed', 'missing', 'cad', 'formulas', 'compatibleWith', 'visualStatus', 'rightsStatus', 'material']
  ) stored;

-- Отбор Studio — организация + позиции производителей по артикулу «MFR-…».
create index if not exists catalog_items_org_mfr_idx
  on public.catalog_items (org_id, article)
  where article like 'MFR-%';
