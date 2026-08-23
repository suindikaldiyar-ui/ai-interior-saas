/**
 * Выбранная тема хранится в куке, а не в localStorage.
 *
 * Причина одна: тему обязан знать СЕРВЕР. Иначе первый кадр приходит тёмным,
 * а светлая тема появляется после гидратации — страница мигает при каждом
 * открытии. Куку читает layout и ставит `data-theme` прямо в HTML, поэтому
 * мигать нечему и никакого скрипта в `<head>` не нужно.
 */
export const THEME_COOKIE = 'mw-theme';

export type Theme = 'dark' | 'light';

/** Что пришло в куке — тема или мусор. По умолчанию тёмная. */
export function themeFromCookie(value: string | undefined): Theme {
  return value === 'light' ? 'light' : 'dark';
}
