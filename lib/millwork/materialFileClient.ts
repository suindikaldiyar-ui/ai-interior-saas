import type { MaterialDefs, MaterialFile } from './materialCatalog';

/**
 * КАТАЛОГ МАТЕРИАЛОВ В БРАУЗЕРЕ — ЗАПРОСОМ, А НЕ В БАНДЛЕ.
 *
 * Файл весит 318 кБ, из них 300 — цвета RAL. Статический импорт положил
 * бы их в первую загрузку рабочего места, которое обязано открываться
 * быстро на планшете. Коллекции приезжают, когда открыли панель:
 * организации — без позиций (её позиции уже в каталоге), демонстрации —
 * с позициями (базы у неё нет).
 *
 * Обещание одно на вкладку; неудачное забывается, чтобы «Повторить»
 * действительно повторяло, а не отдавало ту же ошибку из памяти.
 */

let defs: Promise<MaterialDefs> | null = null;
let full: Promise<MaterialFile> | null = null;

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error ?? `сервер ответил ${response.status}`);
  }
  return body;
}

export function loadMaterialDefs(): Promise<MaterialDefs> {
  if (!defs) {
    defs = read<MaterialDefs>('/api/catalog/materials').catch((error: unknown) => {
      defs = null;
      throw error;
    });
  }
  return defs;
}

export function loadMaterialFile(): Promise<MaterialFile> {
  if (!full) {
    full = read<MaterialFile>('/api/catalog/materials?items=1').catch((error: unknown) => {
      full = null;
      throw error;
    });
  }
  return full;
}
