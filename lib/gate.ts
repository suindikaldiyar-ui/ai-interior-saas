/**
 * Пароль на сайт.
 *
 * Пока продукт не показан клиентам, публичные страницы закрыты одним общим
 * паролем. Это НЕ авторизация: она живёт в Supabase и решает, кто что может.
 * Пароль решает другое — пускать ли на сайт вообще, до запуска.
 *
 * Файл обязан работать и в middleware (Edge), и в server action (Node):
 * поэтому здесь только Web Crypto и ничего из `node:`.
 */

export const GATE_COOKIE = 'mw-gate';

/** Тридцать дней: пароль вводят один раз с устройства, а не каждое утро. */
export const GATE_MAX_AGE_S = 60 * 60 * 24 * 30;

/**
 * Пароль не задан — пускаем всех.
 *
 * Локальная разработка, `npm run build` и все приёмки не должны знать
 * ни о каком пароле: иначе половина проверок начнёт падать на двери.
 */
export function sitePassword(): string | null {
  const value = (process.env.SITE_PASSWORD ?? '').trim();
  return value.length > 0 ? value : null;
}

/**
 * В куке лежит НЕ пароль, а его производная.
 *
 * Пароль общий на всю компанию: утечь из куки, из истории браузера или из
 * лога прокси он не должен. Соль фиксированная и не секретная — она только
 * разводит это значение с любыми другими хешами того же пароля.
 */
export async function gateToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`mw-gate:v1:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Сравнение за постоянное время: длина ответа не должна подсказывать. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Что открыто без пароля.
 *
 * `/p/[token]` — кабинет клиента: ссылку отправляют клиенту, и пароль там
 * неуместен; вместе с ним открыт и тот единственный запрос, который эта
 * страница делает. `/gate` — сама дверь: закрыв её, войти было бы нельзя.
 */
const OPEN_PREFIXES = ['/gate', '/p/', '/api/projects/like'];

export function isOpenPath(pathname: string): boolean {
  return OPEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

/** Куда вернуть после ввода пароля. Только свои адреса, без «//». */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
