import type { RenderStyle } from './renderStyles.types';

/**
 * Точка расширения для клиента-компании: добавьте сюда свой седьмой стиль,
 * и он сам появится в интерфейсе, в запросе к модели и в наборе вариантов.
 * Ядро (lib/renderStyles.ts) править не нужно.
 *
 * Пример:
 * export const CUSTOM_STYLES: RenderStyle[] = [
 *   {
 *     id: 'decofasa-signature',
 *     kk: 'Decofasa стилі',
 *     ru: 'Фирменный стиль Decofasa',
 *     summary: 'Крупноформатные панели, тёплый дуб, латунь',
 *     palette: '…', materials: '…', floor: '…', walls: '…',
 *     upholstery: '…', textiles: '…', light: '…', decor: '…',
 *   },
 * ];
 */
export const CUSTOM_STYLES: RenderStyle[] = [];
