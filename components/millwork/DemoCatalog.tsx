'use client';

import { useEffect } from 'react';
import { DEMO_CATALOG } from '@/lib/millwork/demo';
import { useInteriorStore } from '@/store/useInteriorStore';

/**
 * КАТАЛОГ ДЕМОНСТРАЦИИ СЕЕТСЯ В СТОР.
 *
 * Сам каталог лежит в `lib/millwork/demo` рядом с остальными данными
 * демонстрации — здесь только посев, и делается он ровно один раз: если
 * каталог уже пришёл из Supabase, демо в него не лезет.
 *
 * Компонент ничего не рисует.
 */
export default function DemoCatalog() {
  const catalog = useInteriorStore((state) => state.catalog);
  const setCatalog = useInteriorStore((state) => state.setCatalog);

  useEffect(() => {
    if (catalog.length > 0) return;
    setCatalog(DEMO_CATALOG);
  }, [catalog.length, setCatalog]);

  return null;
}
