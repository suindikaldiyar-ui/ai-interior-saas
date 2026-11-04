import type { Run, WallShelf } from '@/types/millwork';
import { tallTopOfRun } from './zones';

/**
 * ПОЛКА ОТ ПЕНАЛА ДО СТЕНЫ (COMPLETE UNFINISHED, P2) — настенная полка на ряду: одна доска ЛДСП между боковиной
 * высокого модуля (или стеной) и стеной комнаты. Не модуль ряда: в длину ряда не входит, корпуса у неё нет.
 *
 * Её место, деталь раскроя, коробку сцены, прямоугольник листа и слова замка выпуска считает этот файл и те, кто его
 * зовёт (`buildPanels`, `runBoxesByModule`, `ElevationDrawing`, `applyOps`) — одними числами `WallShelf`.
 *
 * Крепления к стене и к боковине и допустимой нагрузки (а значит, прогиба длинной полки) цех не задавал: проектировать
 * можно, выпуск в цех заперт словами (`wallShelfFindings`). Числа крепления не выдумываются.
 */
export const WALL_SHELF_NAME = 'Полка настенная';

/** Пределы формы полки — физика доски, а не нормы крепления: короче 150 и мельче 100 мм полкой не пользуются. */
export const WALL_SHELF_LIMITS = { minLengthMm: 150, minDepthMm: 100, maxDepthMm: 600, minThicknessMm: 16, maxThicknessMm: 40 } as const;

export function nextWallShelfId(run: Pick<Run, 'wallShelves'>): string {
  const used = new Set((run.wallShelves ?? []).map((s) => s.id));
  for (let i = 1; ; i += 1) if (!used.has(`shelf-${i}`)) return `shelf-${i}`;
}

/** Своя форма полки: длина, глубина, толщина, внутри стены и под потолком — отказ словами с мм или `null`. */
export function wallShelfShapeRefusal(
  shelf: WallShelf,
  run: Pick<Run, 'lengthMm' | 'zone' | 'ceilingHeightMm'> & Partial<Pick<Run, 'production' | 'topFiller'>>,
): string | null {
  const name = `Полка ${shelf.fromMm}…${shelf.toMm} мм`;
  const L = WALL_SHELF_LIMITS;
  const ints = [shelf.fromMm, shelf.toMm, shelf.bottomMm, shelf.depthMm, shelf.thicknessMm];
  if (ints.some((v) => !Number.isFinite(v) || Math.round(v) !== v)) return `${name}: место и размеры — целыми миллиметрами.`;
  if (shelf.fromMm < 0 || shelf.toMm > run.lengthMm) return `${name}: выходит за стену ${run.lengthMm} мм.`;
  if (shelf.toMm - shelf.fromMm < L.minLengthMm) return `${name}: ${shelf.toMm - shelf.fromMm} мм — короче ${L.minLengthMm} мм полку не ставят.`;
  if (shelf.depthMm < L.minDepthMm || shelf.depthMm > L.maxDepthMm) {
    return `${name}: глубина ${shelf.depthMm} мм — от ${L.minDepthMm} до ${L.maxDepthMm} мм.`;
  }
  if (shelf.thicknessMm < L.minThicknessMm || shelf.thicknessMm > L.maxThicknessMm) {
    return `${name}: толщина ${shelf.thicknessMm} мм — от ${L.minThicknessMm} до ${L.maxThicknessMm} мм.`;
  }
  const top = tallTopOfRun(run);
  if (shelf.bottomMm < 0 || shelf.bottomMm + shelf.thicknessMm > top) {
    return `${name}: низ ${shelf.bottomMm} мм и толщина ${shelf.thicknessMm} мм — выше потолка ${top} мм на ${shelf.bottomMm + shelf.thicknessMm - top} мм.`;
  }
  return null;
}

/**
 * ЗАМОК ВЫПУСКА (канал «конструкция» `screenState`): у каждой полки — крепление к стене и к боковине и нагрузка не
 * заданы цехом, прогиб не рассчитан. Проектировать, считать и писать можно.
 */
export function wallShelfFindings(run: Pick<Run, 'wallShelves'>, label: string): { words: string }[] {
  return (run.wallShelves ?? []).map((shelf) => ({
    words:
      `${label}: ${WALL_SHELF_NAME.toLowerCase()} ${shelf.fromMm}…${shelf.toMm} мм (${shelf.toMm - shelf.fromMm} мм, толщина ${shelf.thicknessMm} мм) — ` +
      'крепление к стене и к боковине и допустимую нагрузку цех не задавал, прогиб не рассчитан: конструкция не подтверждена',
  }));
}

/** Отпечаток: другая деталь раскроя и другие деньги. Пусто не пишется (ловушка 246). */
export function wallShelfPart(run: Pick<Run, 'wallShelves'>): string {
  const shelves = run.wallShelves ?? [];
  if (shelves.length === 0) return '';
  return `ws=${[...shelves]
    .sort((a, b) => a.fromMm - b.fromMm || a.bottomMm - b.bottomMm)
    .map((s) => `${s.fromMm}-${s.toMm}@${s.bottomMm}x${s.depthMm}x${s.thicknessMm}`)
    .join(';')}`;
}
