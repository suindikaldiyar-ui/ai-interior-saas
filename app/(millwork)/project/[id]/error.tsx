'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * ОБЪЕКТ НЕ ОТКРЫЛСЯ — СЛОВАМИ, А НЕ БЕЛЫМ ЭКРАНОМ.
 *
 * Без этой страницы исключение при отрисовке давало голый «Application error: a client-side exception has occurred»: ни что
 * случилось, ни что делать. Данные объекта при этом целы: падение отрисовки ничего не записывает. Блоки редактора держат свои
 * падения сами (`BlockBoundary`); сюда доходит только то, что случилось вне блоков.
 */
export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[объект не открылся]', error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-screen max-w-xl content-center gap-4 p-6" data-project-error>
      <h1 className="text-[22px] font-medium">Объект не открылся</h1>
      <p className="text-[15px] leading-snug">
        Данные объекта целы: ошибка случилась при показе экрана, ничего не записано и не потеряно.
      </p>
      <p className="text-[13px] leading-snug text-graphiteMw" data-project-error-words>
        Причина: {error.message || 'не названа'}
        {error.digest ? ` · код для поддержки ${error.digest}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="mw-btn mw-btn-primary" data-project-error-retry onClick={() => reset()}>
          Попробовать снова
        </button>
        <Link href="/projects" className="mw-btn mw-btn-ghost">
          К списку объектов
        </Link>
      </div>
    </main>
  );
}
