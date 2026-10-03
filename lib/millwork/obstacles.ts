import { OPENING_KIND_TITLE } from '@/types/millwork';
import type { Opening, OpeningKind, Run, RunOptions } from '@/types/millwork';
import type { ProductionSettings } from '@/types/catalog';
import { GEOMETRY } from './modules';
import { upperBottomMm, workTopMm } from './shop';

/**
 * ПРЕПЯТСТВИЯ У СТЕНЫ — ОДНО МЕСТО НА ВСЕ РЯДЫ (слой 56).
 *
 * «Стена выступает — рядом с ней ставим дальше». Колонна, короб и выступ
 * стены выходят в комнату и занимают место у стены на какой-то высоте.
 * Ряд мебели живёт на своей ПОЛОСЕ высот: нижний — от пола до столешницы,
 * верхний — от навески до своего верха, антресоль — у потолка. Любое
 * препятствие, заходящее в полосу ряда, рвёт этот ряд: короб у пола рвёт
 * нижний и не трогает верхний, ригель — наоборот.
 *
 * Здесь ответ на два вопроса — ЧТО стоит у стены и ЗАХОДИТ ли оно в полосу
 * ряда. Участки ряда (`rowSpansOfRun`), раскладка по шаблону (`buildRun`),
 * правка (`applyOps`), библиотека, столешница, цоколь и фартук спрашивают
 * их здесь. Второго «где можно стоять» в продукте нет.
 */

/**
 * Виды проёма, которые стоят у стены и мешают мебели на своей высоте.
 *
 * Ригеля здесь нет намеренно: у него свои правила (слой 44). Висящий ряд
 * под ним ниже и рвётся, только если полезной высоты не осталось
 * (`beamBlockedSpans`); мебель, упирающаяся в него, — исключение со
 * словами, а не обход (ловушка 379). Нижнего ряда он не трогает.
 */
const FLOOR_KINDS: ReadonlySet<OpeningKind> = new Set<OpeningKind>(['column', 'pipe_box', 'protrusion']);

/** Препятствие ли этот проём для мебели: колонна, короб, выступ стены. */
export function isWallObstacle(kind: OpeningKind): boolean {
  return FLOOR_KINDS.has(kind);
}

/** Что стоит у стены и мешает мебели — в координатах ряда. */
export type WallObstacle = {
  id: string;
  kind: OpeningKind;
  from: number;
  to: number;
  /** Низ и верх от пола, мм. */
  bottomMm: number;
  topMm: number;
  /**
   * Вынос от стены, мм. `null` — не замерен: место занято на всю глубину
   * ряда, и это сказано словами (`depthUnknownWarnings`).
   */
  depthMm: number | null;
  /** Как это называется человеку: «выступ стены», «колонна», «короб». */
  reason: string;
};

/**
 * Препятствия, которые едут НА РЯДУ: колонна, короб, выступ стены —
 * обрезанные по длине ряда, как ригели (`beamsOnRun`). Столешницу, цоколь
 * и фартук считают функции, видящие только ряд (`countertopSlabs`), и
 * обойти препятствие они могут, только если оно лежит на ряду.
 */
export function obstaclesOnRun(openings: Opening[] | undefined, lengthMm: number): Opening[] {
  const kept: Opening[] = [];
  for (const opening of openings ?? []) {
    if (!isWallObstacle(opening.kind)) continue;
    const from = Math.max(0, opening.fromCornerMm);
    const to = Math.min(lengthMm, opening.fromCornerMm + opening.widthMm);
    if (to - from <= 0) continue;
    kept.push({ ...opening, fromCornerMm: Math.round(from), widthMm: Math.round(to - from) });
  }
  return kept.sort((a, b) => a.fromCornerMm - b.fromCornerMm);
}

/**
 * РЯД С ПРЕПЯТСТВИЯМИ ЗАМЕРА — КАЖДЫЙ ПОКАЗ, А НЕ ИЗ СОХРАНЕНИЯ.
 *
 * Сохранённый ряд лежит с теми препятствиями, что были на момент записи,
 * или вовсе без них. Внесли выступ в замер — столешница, цоколь и фартук
 * обязаны узнать о нём сразу, а модули, зашедшие в него, — назвать себя
 * (`obstacleConflicts`). Кладутся препятствия там же, где композиция
 * кладёт угол: стене А — в `composeVariants`, соседним — в `wallSegments`.
 */
export function runWithObstacles(run: Run, obstacles: Opening[] | undefined): Run {
  if (!obstacles || obstacles.length === 0) {
    if (!run.obstacles) return run;
    const { obstacles: _stale, ...rest } = run;
    void _stale;
    return rest;
  }
  return { ...run, obstacles };
}

/**
 * ЧТО СТОИТ У СТЕНЫ — с высотой, выносом и именем.
 *
 * Высота не замерена (0) — препятствие считается до потолка, как и
 * невыясненный вынос считается на всю глубину ряда: неизвестное не
 * превращается в «препятствия нет». Выступ стены стоит на полу; его
 * незамеренную высоту замер уже достроил до потолка допущением
 * (`resolveSurvey`), и здесь она приходит числом.
 */
export function wallObstacles(openings: Opening[] | undefined, ceilingHeightMm: number): WallObstacle[] {
  const out: WallObstacle[] = [];
  for (const opening of openings ?? []) {
    if (opening.widthMm <= 0) continue;
    const base = {
      id: opening.id,
      kind: opening.kind,
      from: Math.round(opening.fromCornerMm),
      to: Math.round(opening.fromCornerMm + opening.widthMm),
      depthMm: typeof opening.depthMm === 'number' && opening.depthMm > 0 ? Math.round(opening.depthMm) : null,
    };
    if (!isWallObstacle(opening.kind)) continue;

    const bottomMm = opening.kind === 'protrusion' ? 0 : Math.max(0, Math.round(opening.sillMm));
    const topMm =
      opening.heightMm > 0 ? Math.min(ceilingHeightMm, bottomMm + Math.round(opening.heightMm)) : ceilingHeightMm;
    out.push({ ...base, bottomMm, topMm, reason: OPENING_KIND_TITLE[opening.kind].toLowerCase() });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Ряд мебели и его полоса высот от пола. */
export type RowName = 'base' | 'upper' | 'mezzanine';
export type RowBand = { row: RowName; bottomMm: number; topMm: number };

/**
 * ПОЛОСА ВЫСОТ РЯДА — от чего до чего от пола он стоит.
 *
 *   нижний     пол → верх столешницы (`workTopMm`)
 *   верхний    навеска → верх ряда (до потолка, если ряд до потолка)
 *   антресоль  у потолка: её высота, а без неё — от верха верхнего ряда
 *
 * Та же полоса, по которой окно рвёт верхний ряд: второй формулы «докуда
 * ряд» нет.
 */
export function rowBandMm(
  row: RowName,
  input: {
    ceilingHeightMm: number;
    options: Pick<RunOptions, 'upperToCeiling'>;
    production?: ProductionSettings;
    /** Высота антресоли ряда, если она заказана. */
    mezzanineMm?: number | null;
  },
): RowBand {
  if (row === 'base') return { row, bottomMm: 0, topMm: workTopMm(input.production) };

  const bottom = upperBottomMm(input.production);
  const upperTop = input.options.upperToCeiling ? input.ceilingHeightMm : bottom + GEOMETRY.upper.carcassH;
  if (row === 'upper') return { row, bottomMm: bottom, topMm: upperTop };

  const mezzBottom = input.mezzanineMm ? input.ceilingHeightMm - input.mezzanineMm : upperTop;
  return { row, bottomMm: Math.min(mezzBottom, input.ceilingHeightMm), topMm: input.ceilingHeightMm };
}

/** ЗАХОДИТ ЛИ ПРЕПЯТСТВИЕ В ПОЛОСУ РЯДА. Касание — не захождение. */
export function obstaclesInBand(obstacles: WallObstacle[], band: RowBand): WallObstacle[] {
  return obstacles.filter((obstacle) => obstacle.topMm > band.bottomMm && obstacle.bottomMm < band.topMm);
}

/**
 * Препятствия нижнего ряда, которые лежат на РЯДУ (`Run.obstacles`): для
 * тех, кто видит только ряд, — подсветки переноса и отрисовки. Та же
 * полоса и та же функция, что у участков.
 */
export function baseObstaclesOf(
  run: { obstacles?: Opening[]; ceilingHeightMm: number; options: Pick<RunOptions, 'upperToCeiling'>; production?: ProductionSettings },
): WallObstacle[] {
  return obstaclesInBand(
    wallObstacles(run.obstacles, run.ceilingHeightMm),
    rowBandMm('base', { ceilingHeightMm: run.ceilingHeightMm, options: run.options, production: run.production }),
  );
}

/** Преграды ряда для участков: отрезок и имя. */
export function obstacleBlockers(
  openings: Opening[] | undefined,
  band: RowBand,
  ceilingHeightMm: number,
): { from: number; to: number; reason: string }[] {
  return obstaclesInBand(wallObstacles(openings, ceilingHeightMm), band).map((obstacle) => ({
    from: obstacle.from,
    to: obstacle.to,
    reason: obstacle.reason,
  }));
}

/** Модуль, зашедший в препятствие: кто, во что и на сколько. */
export type ObstacleConflict = {
  moduleId: string;
  label: string;
  row: RowName;
  obstacleId: string;
  reason: string;
  overlapMm: number;
};

/**
 * МЕБЕЛЬ, ЗАШЕДШАЯ В ПРЕПЯТСТВИЕ — ТАК БЫВАЕТ, ТОЛЬКО ЕСЛИ ЕГО ВНЕСЛИ ПОЗЖЕ.
 *
 * Раскладка и правка в препятствие мебель не ставят. Но замерщик вносит
 * выступ в замер, когда мебель уже расставлена и поправлена руками, — и
 * модули, оказавшиеся в его зоне, молча не удаляются: каждый называется
 * с миллиметрами, а выход — «Пересобрать стену».
 *
 * Модуль сверяется с препятствиями ПОЛОСЫ СВОЕГО РЯДА: нижний — от пола
 * до столешницы (пенал — во всю высоту), верхний и антресоль — своими.
 * Препятствия берутся из замера стены, а не с ряда: сохранённый ряд о
 * новом выступе не знает.
 */
export function obstacleConflicts(
  run: Pick<Run, 'modules' | 'upperSegments' | 'ceilingHeightMm' | 'options' | 'production' | 'mezzanine'>,
  openings: Opening[] | undefined,
): ObstacleConflict[] {
  const all = wallObstacles(openings, run.ceilingHeightMm);
  if (all.length === 0) return [];
  const shell = {
    ceilingHeightMm: run.ceilingHeightMm,
    options: run.options,
    production: run.production,
    mezzanineMm: run.mezzanine?.heightMm ?? null,
  };
  const inBand = (row: RowName) => obstaclesInBand(all, rowBandMm(row, shell));
  const tall = all;
  const rows: { row: RowName; units: Run['modules']; against: (unit: Run['modules'][number]) => WallObstacle[] }[] = [
    { row: 'base', units: run.modules, against: (unit) => (unit.kind === 'tall' ? tall : inBand('base')) },
    {
      row: 'upper',
      units: run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => unit.section !== 'mezzanine'),
      against: () => inBand('upper'),
    },
    {
      row: 'mezzanine',
      units: run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => unit.section === 'mezzanine'),
      against: () => inBand('mezzanine'),
    },
  ];

  const found: ObstacleConflict[] = [];
  for (const { row, units, against } of rows) {
    for (const unit of units) {
      for (const obstacle of against(unit)) {
        const overlapMm =
          Math.min(unit.offsetMm + unit.widthMm, obstacle.to) - Math.max(unit.offsetMm, obstacle.from);
        if (overlapMm <= 0) continue;
        found.push({
          moduleId: unit.id,
          label: unit.label,
          row,
          obstacleId: obstacle.id,
          reason: obstacle.reason,
          overlapMm: Math.round(overlapMm),
        });
      }
    }
  }
  return found;
}

/** «base-2400 («Дверца») заходит в выступ стены на 120 мм» — одна строка на модуль. */
export function obstacleConflictText(conflict: ObstacleConflict): string {
  const id = conflict.moduleId.replace(/@.*$/, '');
  return `${id} («${conflict.label}») заходит в ${accusative(conflict.reason)} на ${conflict.overlapMm} мм`;
}

/** «заходит в колонну / в короб / в выступ стены» — винительный падеж имени. */
function accusative(reason: string): string {
  if (reason === 'колонна') return 'колонну';
  return reason;
}

/** «Замерьте вынос колонны», «у выступа стены»: у каждого вида свой падеж. */
const GENITIVE: Partial<Record<OpeningKind, string>> = {
  column: 'колонны',
  pipe_box: 'короба',
  protrusion: 'выступа стены',
};

/** Имя препятствия в родительном падеже: «колонны», «короба», «выступа стены». */
export function obstacleGenitive(kind: OpeningKind): string {
  return GENITIVE[kind] ?? 'препятствия';
}

/**
 * ВЫНОС НЕ ЗАМЕРЕН — ЭТО СКАЗАНО СЛОВАМИ.
 *
 * Без выноса препятствие занимает место у стены на всю глубину ряда, и
 * столешница там рвётся, даже если на деле хватило бы выреза. Последствие
 * — первым, просьба — в конце фразы.
 */
export function depthUnknownMessages(openings: Opening[] | undefined, ceilingHeightMm: number): string[] {
  return wallObstacles(openings, ceilingHeightMm)
    .filter((obstacle) => obstacle.depthMm === null)
    .map(
      (obstacle) =>
        `${OPENING_KIND_TITLE[obstacle.kind]} ${obstacle.from}…${obstacle.to} мм: вынос не замерен — ` +
        `место у стены занято на всю глубину ряда, столешница там рвётся. ` +
        `Замерьте вынос ${GENITIVE[obstacle.kind] ?? 'препятствия'}.`,
    );
}
