/**
 * Заголовки арендатора. Вынесены отдельно: middleware.ts выполняется на краю
 * и импортировать его из серверных компонентов не стоит.
 */
export const ORG_HOST_HEADER = 'x-org-host';
export const ORG_SLUG_HEADER = 'x-org-slug';
