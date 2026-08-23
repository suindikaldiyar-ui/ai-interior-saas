'use client';

import { useEffect, useState } from 'react';
import { THEME_COOKIE, type Theme } from '@/lib/theme';

/**
 * Тёмная тема по умолчанию, светлая — переключателем, выбор запоминается.
 *
 * Замерщик работает и в квартире с закрытыми шторами, и на солнце у окна:
 * один и тот же экран в этих условиях читается по-разному, поэтому выбор
 * отдан человеку, а не датчику.
 *
 * Значение живёт в куке — её читает серверный layout и ставит `data-theme`
 * прямо в HTML. Здесь мы только переключаем: атрибут меняется сразу, без
 * перезагрузки, а кука нужна следующему открытию страницы.
 */

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    // Год: выбор темы не из тех решений, которые принимают заново.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      className={`mw-btn mw-btn-ghost mw-touch px-0 ${className}`}
    >
      <span aria-hidden>{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}
