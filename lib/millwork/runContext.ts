import type { Module, Run } from '@/types/millwork';
import { moduleCarcassHeightMm, refitDrawerFronts, shelfAboveRoof } from './fill';
import { bayEnvelope, bayLayout } from './bays';
import { shopOf } from './shop';

/**
 * ОКРУЖЕНИЕ ПРАВЛЕНОГО РЯДА — ИЗ ЖИВОГО СОСТОЯНИЯ, НА КАЖДОМ ПОКАЗЕ (STAGE 01).
 *
 * Правленый ряд хранится целиком (ловушка 42), и вместе с модулями в нём
 * лежат две величины, которые ВЫВОДЯТСЯ из канона, а не выбираются в ряду:
 *
 *   production       школа цеха организации под отметками объекта
 *                    (`productionFor` — одна развилка на продукт)
 *   ceilingHeightMm  потолок из замера
 *
 * Ряд по шаблону собирается заново и получает их живыми. Правленый держал
 * СНИМОК с минуты первой правки, и всё, что видит ряд — сцена, чертёж,
 * раскрой, присадка, — шло по снимку: «Глубина нижнего» в поле 450, а
 * мебель 560; потолок в замере 2900, а шкафы по 2700. Первая же правка —
 * материал, фасад, фурнитура — замораживала размеры молча.
 *
 * Здесь они кладутся заново, как угол (`runWithCorner`) и препятствия
 * (`runWithObstacles`): стене А — в `composeVariants`, соседним — в
 * `wallSegments`, и этот же ряд видят сцена, раскрой и смета.
 *
 * Высота корпуса от этого может смениться, а наполнение правленого модуля
 * человек выбирал под прежнюю. Фронты ящиков подгоняет правило, которым
 * они раскладываются (`refitDrawerFronts`). Полки, штанги и отсеки не
 * двигаются: что перестало встать — названо (`losses`), а не срезано и не
 * пересчитано за человека.
 */
export type RunContext = { production?: Run['production']; ceilingHeightMm: number };

/** Что из правленого наполнения не встаёт в новую высоту корпуса — модуль и слова. */
export type ContextLoss = { moduleId: string; label: string; words: string };

export type InContext = {
  run: Run;
  /** Чьи фронты ящиков подогнаны под новую высоту. */
  refitted: string[];
  /** Что не встало — модуль и слова; такой ряд не выпускается. */
  losses: ContextLoss[];
};

/**
 * ПРАВЛЕНЫЕ РЯДЫ НА НОВЫХ ОТМЕТКАХ — ДО ПРИМЕНЕНИЯ (STAGE 01).
 *
 * Отметка меняет высоту корпуса, а наполнение правленых модулей человек
 * выбирал под прежнюю. Экран спрашивает здесь, ЧТО станет с ним, и только
 * потом пишет отметку: не встаёт — правка не применяется, и названо, что
 * именно (как `set_height`: «наполнение молча не снимается»).
 */
export function contextChange(rows: { saved: Run; live: RunContext }[]): { refitted: string[]; losses: ContextLoss[] } {
  const refitted: string[] = [];
  const losses: ContextLoss[] = [];
  for (const { saved, live } of rows) {
    const result = runInContext(saved, live);
    refitted.push(...result.refitted);
    losses.push(...result.losses);
  }
  return { refitted, losses };
}

export function runInContext(saved: Run, live: RunContext): InContext {
  if (saved.production === live.production && saved.ceilingHeightMm === live.ceilingHeightMm) {
    return { run: saved, refitted: [], losses: [] };
  }

  const shell: Run = { ...saved, ceilingHeightMm: live.ceilingHeightMm };
  if (live.production) shell.production = live.production;
  else delete shell.production;

  const refitted: string[] = [];
  const losses: ContextLoss[] = [];
  const t = shopOf(shell.production).carcassMm;
  const tWas = shopOf(saved.production).carcassMm;

  const refit = (unit: Module): Module => {
    const fill = unit.fill;
    if (!fill) return unit;
    const was = moduleCarcassHeightMm(unit, saved);
    const now = moduleCarcassHeightMm(unit, shell);
    if (was === now) return unit;

    const lost: string[] = [];
    let next = fill;

    if (fill.drawerHeights.length > 0) {
      const fronts = refitDrawerFronts(fill.drawerHeights, was, now);
      if (fronts) {
        if (fronts !== fill.drawerHeights) {
          next = { ...next, drawerHeights: fronts };
          refitted.push(unit.id);
        }
      } else {
        lost.push(`${fill.drawerHeights.length} ящ. не встают в корпус ${now} мм (раскладку ставили под ${was})`);
      }
    }

    /* Только то, что встало под прежней крышей и не встаёт под новой. */
    const shelves = fill.shelves.filter((mm) => shelfAboveRoof(mm, now - t, t) && !shelfAboveRoof(mm, was - tWas, tWas));
    if (shelves.length > 0) lost.push(`${shelves.length === 1 ? 'полка' : 'полки'} на ${shelves.join(', ')} мм выше крыши ${now - t} мм`);
    const rods = fill.rodsMm.filter((mm) => mm >= now - t && mm < was - tWas);
    if (rods.length > 0) lost.push(`штанга на ${rods.join(', ')} мм выше крыши ${now - t} мм`);

    if (fill.bays) {
      const before = new Set(bayLayout(unit, bayEnvelope(unit, saved))?.problems ?? []);
      for (const problem of bayLayout(unit, bayEnvelope(unit, shell))?.problems ?? []) {
        if (!before.has(problem)) lost.push(problem);
      }
    }

    if (lost.length > 0) losses.push({ moduleId: unit.id, label: unit.label, words: `«${unit.label}»: ${lost.join('; ')}` });
    return next === fill ? unit : { ...unit, fill: next };
  };

  return {
    run: {
      ...shell,
      modules: saved.modules.map(refit),
      upperSegments: saved.upperSegments.map((segment) => ({ ...segment, modules: segment.modules.map(refit) })),
    },
    refitted,
    losses,
  };
}
