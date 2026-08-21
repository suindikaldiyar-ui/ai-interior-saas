-- Новые значения перечислений живут в ОТДЕЛЬНОЙ миграции.
--
-- Postgres не даёт использовать только что добавленное значение enum в той же
-- транзакции, где оно создано: `default 'surveyor'` в следующей миграции
-- упал бы с «unsafe use of new value». Поэтому сначала коммитим значения.

alter type org_role add value if not exists 'surveyor';
alter type project_status add value if not exists 'in_production';
