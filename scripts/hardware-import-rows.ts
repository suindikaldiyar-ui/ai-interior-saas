/**
 * СТРОКИ КАТАЛОГА ФУРНИТУРЫ ДЛЯ ЗАСЕВА ВРЕМЕННЫХ ОРГАНИЗАЦИЙ ПРИЁМКИ (PART 7).
 *
 * Ровно то, что маршрут импорта (`/api/catalog/hardware`, `confirm`) вставил
 * бы в пустой каталог: `planHardwareImport([], HARDWARE_FACTS).insert`. Части
 * браузерной приёмки, которые проверяют не сам импорт, засевают каталог этими
 * строками один раз разобранными — 27 последовательных запросов по 200 строк
 * на каждую часть не укладывались в предел вызова. Импорт путём экрана
 * проверяет часть `import`.
 *
 * Выход — JSON в stdout: `{ count, rows: [{ article, name_ru, name_kk, price, unit, meta }] }`.
 * Ошибки плана (повтор артикула, чужой префикс) — падение со словами.
 */
import { HARDWARE_FACTS, planHardwareImport } from '../lib/millwork/hardwareCatalog';

const plan = planHardwareImport([], HARDWARE_FACTS);
if (plan.errors.length > 0) {
  throw new Error(`план импорта с ошибками: ${plan.errors.slice(0, 3).map((e) => `${e.article}: ${e.why}`).join('; ')}`);
}
if (plan.insert.length !== HARDWARE_FACTS.length) {
  throw new Error(`в пустой каталог ложится ${plan.insert.length} строк при ${HARDWARE_FACTS.length} в фактах`);
}
const rows = plan.insert.map((row) => ({ article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, price: row.price, unit: row.unit, meta: row.meta }));
process.stdout.write(JSON.stringify({ count: rows.length, rows }));
