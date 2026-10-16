import type { BayDrawerStack, ModuleFill } from '@/types/millwork';

/**
 * СКОЛЬКО ЯЩИКОВ В ОТСЕКАХ И КАКОЙ ВЫСОТЫ ИХ ЗОНЫ (R02A) — без зависимостей.
 *
 * Модуль нарочно ничего не импортирует: его зовёт `opening.ts` (направляющие
 * в смете), а `opening.ts` грузится из `fill.ts`. Возьми он эти функции из
 * `bays.ts`, `bays` → `fill` → `opening` → `bays` замкнулись бы в кольцо, и
 * константы `fill` читались бы до своего объявления. Геометрию ящиков
 * по-прежнему считает `bayLayout`; здесь только число и высоты зон — те же,
 * что берёт она.
 */

/** Высоты зон ящиков снизу вверх: поровну — остаток верхнему, вручную — как задал человек. */
export function drawerHeights(stack: BayDrawerStack): number[] {
  if (stack.drawers.mode === 'manual') return [...stack.drawers.heights];
  const count = stack.drawers.count;
  if (!Number.isInteger(count) || count < 1) return [];
  const base = Math.floor(stack.heightMm / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? stack.heightMm - base * (count - 1) : base));
}

/** Сколько ящиков отсеков в наполнении — для сметы и направляющих. */
export function bayDrawerCount(fill: ModuleFill | undefined): number {
  return (fill?.bays ?? []).reduce((sum, bay) => sum + (bay.drawers ? drawerHeights(bay.drawers).length : 0), 0);
}
