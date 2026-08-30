/**
 * Адрес публичной страницы читается человеком.
 *
 * `/zk/atamura-urpaq-2/3k-90-5` — это объявление, которое отправляют в
 * мессенджере и вставляют в рекламу; `/zk/8f3a…-uuid` в этой роли выглядит
 * как ошибка. Поэтому у ЖК и планировки есть слаг, а не только id.
 */

const RU: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Казахские буквы: ЖК называются и так тоже.
  ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
};

export function slugify(value: string): string {
  const lower = value.toLowerCase().trim();

  let out = '';
  for (const char of lower) {
    if (char in RU) out += RU[char];
    else if (/[a-z0-9]/.test(char)) out += char;
    else out += '-';
  }

  return out.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Слаг, которого ещё нет среди занятых. Второй «3К-90.5» в том же ЖК
 * получает `3k-90-5-2`, а не молча перетирает первый.
 */
export function uniqueSlug(value: string, taken: string[]): string {
  const base = slugify(value) || 'plan';
  if (!taken.includes(base)) return base;

  for (let i = 2; i < 500; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
