import type { VariantKey } from '@/types/millwork';

/**
 * Стиль подобран под бюджет, а не наоборот.
 *
 * Отдельный модуль без 'use client': эту таблицу читает и кабинет клиента,
 * который рисуется на сервере. Импорт значения из клиентского модуля даёт
 * серверу ссылку на модуль, а не саму таблицу, — и подстановка молча
 * возвращает undefined.
 */
export const VARIANT_STYLE: Record<VariantKey, string> = {
  basic: 'scandi',
  optimal: 'warm-minimal',
  premium: 'premium-modern',
};

export const MILLWORK_STYLE_IDS = [
  VARIANT_STYLE.basic,
  VARIANT_STYLE.optimal,
  VARIANT_STYLE.premium,
];
