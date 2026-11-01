/**
 * СЕЧЕНИЯ МЕТАЛЛИЧЕСКИХ ПРОФИЛЕЙ МЕХАНИЗМОВ (ТЗ 2026-10-31, § 5, 8) — без three.
 *
 * Царга системы ящика и секция телескопической направляющей рисовались
 * серым бруском. Здесь — их сечение: контур в плоскости X–Y, который сцена
 * выдавливает вдоль хода (Z). Размеры сечения — габарит детали движка
 * (`DrawerPiece`: ширина картинки царги, высота царги по паспорту, монтажная
 * ширина направляющей), то есть деталь не меняет ни места, ни габарита;
 * форма внутри габарита — ВИЗУАЛЬНАЯ РЕКОНСТРУКЦИЯ: сечение профиля
 * производитель не образмерил, толщина стенки — условная (`PROFILE_WALL_MM`).
 *
 * Контур нормирован к единичному квадрату [−0,5; 0,5]: сцена масштабирует
 * его габаритом коробки, как обычную коробку пачки, — и скругление остаётся
 * круглым, потому что контур построен по настоящим миллиметрам.
 */

export type MetalProfileKind = 'drawer-side' | 'runner-channel';

/** Толщина стенки профиля на картинке, мм: условная — в паспортах сечение не образмерено. */
export const PROFILE_WALL_MM = 1.2;

export const METAL_PROFILE_WORDS: Record<MetalProfileKind, string> = {
  'drawer-side': 'царга: двойная стальная стенка со скруглённым верхом и посадкой на ходовую снизу — визуальная реконструкция, сечение в паспорте не образмерено',
  'runner-channel': 'секция направляющей: С-профиль, открытый к ящику — визуальная реконструкция, сечение в паспорте не образмерено',
};

/**
 * КОНТУР СЕЧЕНИЯ, нормированный к габариту. `inner` — где внутренняя сторона
 * (к центру ящика): +x у левой детали, −x у правой. Обход — против часовой.
 */
export function metalProfileOutline(kind: MetalProfileKind, widthMm: number, heightMm: number, inner: 1 | -1): [number, number][] {
  const w = Math.max(widthMm, 0.1);
  const h = Math.max(heightMm, 0.1);
  const pts: [number, number][] = [];
  if (kind === 'drawer-side') {
    /* Скругление верха — полуокружность по ширине царги; посадка на ходовую — выемка снизу с внутренней стороны. */
    const r = Math.min(w / 2, h / 2);
    const seatH = Math.min(12, h * 0.2);
    const seatW = w * 0.55;
    pts.push([0, 0]);
    pts.push([w - seatW, 0]);
    pts.push([w - seatW, seatH]);
    pts.push([w, seatH]);
    pts.push([w, h - r]);
    for (let i = 1; i < 16; i += 1) {
      const a = (Math.PI * i) / 16;
      pts.push([w / 2 + r * Math.cos(a) * (w / 2 / r), h - r + r * Math.sin(a)]);
    }
    pts.push([0, h - r]);
  } else {
    /* С-профиль: стенка у корпуса, полки сверху и снизу, открыт к ящику. */
    const t = Math.min(PROFILE_WALL_MM, w / 3, h / 3);
    pts.push([0, 0], [w, 0], [w, t], [t, t], [t, h - t], [w, h - t], [w, h], [0, h]);
  }
  /* В единичный квадрат; внутренняя сторона — по `inner` (у правой детали контур отражён, обход сохранён). */
  const norm = pts.map(([x, y]): [number, number] => [x / w - 0.5, y / h - 0.5]);
  return inner === 1 ? norm : norm.map(([x, y]): [number, number] => [-x, y]).reverse();
}

/** Площадь контура со знаком (против часовой — плюс): приёмке — что обход не вывернут. */
export function outlineArea(points: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}
