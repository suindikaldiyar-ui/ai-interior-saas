'use client';

import { useEffect, useState } from 'react';

/**
 * Технические подписи — по запросу, а не в основном потоке.
 *
 * Секунды рендера, число модулей, отпечаток конфигурации нужны нам, а не
 * клиенту, который сидит рядом с замерщиком и смотрит в тот же планшет.
 * Они включаются адресом `?debug=1` и там же остаются.
 *
 * Читаем из `window.location`, а не через `useSearchParams`: хук заставил бы
 * оборачивать в Suspense половину конфигуратора ради одной строки.
 */
export function useDebug(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).get('debug') === '1');
  }, []);

  return on;
}
