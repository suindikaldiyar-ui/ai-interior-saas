import type { FrontSpec, Module, Run } from '@/types/millwork';
import { moduleCarcassHeightMm, moduleDepthMm, moduleFloorMm, upperBottomFor } from './fill';
import { ceilingOverModuleMm } from './ceiling';
import { DEFAULT_FRONT } from './frontMaterial';
import { shopOf } from './shop';
import { zoneTopOfRun } from './zones';

/**
 * ВЕРХНЯЯ ФАЛЬШПАНЕЛЬ НАД МЕБЕЛЬЮ ДО ПОТОЛКА (ТЗ 2026-11-02, задача B; решение владельца: корпус ниже
 * на её высоту).
 *
 * Канон — `Run.topFiller` (высота, отступ лица от плоскости фасадов, материал). Отсюда: верх зоны
 * (`zoneTopOfRun` — потолок − зазор цеха − планка; одна функция на все высоты «до потолка»), участки
 * планки (`topFillerSpans` — где мебель доходит до верха зоны, по тем же `moduleFloorMm` +
 * `moduleCarcassHeightMm`, что ставит сцена), деталь раскроя, коробка сцены, прямоугольник для хода
 * подъёмника (`topFillerBoxMm`) и высоты над корпусом словами (`ceilingStack`). Своего второго числа нет.
 * Крепление планки цехом не задано — называется словами, присадка — «не рассчитана».
 */

export const TOP_FILLER_PANEL_NAME = 'Фальшпанель верхняя';
/** Примеры высот из ТЗ — кнопки выбора, а не умолчание: высота вводится и числом. */
export const TOP_FILLER_EXAMPLES_MM = [50, 80, 100, 120] as const;
export const TOP_FILLER_MOUNT_WORDS =
  'Крепление планки к крыше корпуса (брусок, уголки) цехом не задано — присадка планки не рассчитана.';

/** Участок планки: по длине ряда и глубина мебели под ним — планка стоит в плоскости её фасадов. */
export type TopFillerSpan = { index: number; fromMm: number; toMm: number; depthMm: number; partId: string };

/** Верх модуля от пола, мм — как его ставит сцена: низ (`moduleFloorMm`) плюс корпус. */
export function moduleTopMm(unit: Module, run: Run): number {
  return moduleFloorMm(unit, run) + moduleCarcassHeightMm(unit, run);
}

/** Материал планки: свой или как фасады кухни. */
export function topFillerFront(run: Pick<Run, 'topFiller' | 'kitchenFront'>): FrontSpec {
  return run.topFiller?.front ?? run.kitchenFront ?? DEFAULT_FRONT;
}

/**
 * Участки ряда, где мебель доходит до верха зоны (± 1 мм): над ними планка. Стык в стык сливаются только
 * модули одной глубины — у пенала 560 и антресоли 320 плоскость фасадов разная, и планка над ними — две.
 */
export function topFillerSpans(run: Run): TopFillerSpan[] {
  if (!run.topFiller) return [];
  const top = zoneTopOfRun(run);
  const ranges = [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)]
    .filter((unit) => Math.abs(moduleTopMm(unit, run) - top) <= 1)
    .map((unit) => ({ from: unit.offsetMm, to: unit.offsetMm + unit.widthMm, depth: moduleDepthMm(unit, run.zone, run.production) }))
    .sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number; depth: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to + 1 && range.depth === last.depth) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged.map((m, index) => ({ index, fromMm: m.from, toMm: m.to, depthMm: m.depth, partId: `${run.id}:top-filler:${index}` }));
}

/**
 * ПЛАНКА В ОСЯХ КОРПУСА (как ход подъёмника): z — от передней кромки корпуса вперёд (лицо фасада на
 * толщине фасада), y — от пола. Лицо планки утоплено от лица фасадов на `setbackMm`.
 */
export function topFillerBoxMm(run: Run, frontMm: number): { z0: number; z1: number; y0: number; y1: number } | null {
  if (!run.topFiller) return null;
  const top = zoneTopOfRun(run);
  const setback = run.topFiller.setbackMm ?? 0;
  return { z0: -setback, z1: frontMm - setback, y0: top, y1: top + run.topFiller.heightMm };
}

/**
 * МОЖНО ЛИ ТАК — словами с миллиметрами: высота и отступ — целые мм; с новой планкой ни один модуль
 * не выходит выше верха зоны (у антресоли над верхним рядом и у модуля своей высоты высота не
 * подстраивается — их и называет отказ).
 */
export function topFillerRefusal(run: Run): string | null {
  const filler = run.topFiller;
  if (!filler) return null;
  if (!Number.isInteger(filler.heightMm) || filler.heightMm <= 0) return `Высота фальшпанели — целые миллиметры больше нуля: ${filler.heightMm} мм не режется.`;
  const setback = filler.setbackMm ?? 0;
  if (!Number.isInteger(setback) || setback < 0) return `Отступ фальшпанели — целые миллиметры от нуля: ${setback} мм.`;
  const top = zoneTopOfRun(run);
  let worst: { unit: Module; over: number } | null = null;
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)]) {
    const over = moduleTopMm(unit, run) - top;
    if (over > 0.5 && (!worst || over > worst.over)) worst = { unit, over };
  }
  if (worst) {
    return (
      `Фальшпанели ${filler.heightMm} мм не хватает места: «${worst.unit.label}» кончается на ${Math.round(moduleTopMm(worst.unit, run))} мм, ` +
      `а верх мебели с планкой — ${Math.round(top)} мм (лишние ${Math.round(worst.over)} мм). Уменьшите антресоль или планку.`
    );
  }
  return null;
}

/**
 * ДО ЧЕГО ФАСАДУ ПОДНИМАТЬСЯ НАД МОДУЛЕМ (B3, B4): потолок, под ригелем — его низ, и модуль, висящий над
 * этим (антресоль над шкафом). Одна функция на проверку хода подъёмника (`fittingVerdict`) и на блок
 * высот (`ceilingStack`): «до потолка 100 мм» в блоке и в отказе — одно число.
 */
export function liftLimitOf(unit: Module, run: Run): { limitMm: number; words: string } {
  const top = moduleTopMm(unit, run);
  const ceiling = ceilingOverModuleMm(unit, run);
  let limitMm = ceiling;
  let words = ceiling < run.ceilingHeightMm ? 'до ригеля' : 'до потолка';
  for (const other of (run.upperSegments ?? []).flatMap((segment) => segment.modules)) {
    if (other.id === unit.id || other.offsetMm >= unit.offsetMm + unit.widthMm || other.offsetMm + other.widthMm <= unit.offsetMm) continue;
    const bottom = upperBottomFor(other, run);
    if (bottom >= top - 1 && bottom < limitMm) {
      limitMm = bottom;
      words = `до «${other.label}» над ним`;
    }
  }
  return { limitMm, words };
}

/**
 * ВЫСОТЫ НАД МОДУЛЕМ СЛОВАМИ (B3): помещение, верх и высота корпуса, фальшпанель, зазор до потолка над
 * ней, свободное место над корпусом для хода фасада (до потолка — фасад подъёмника проходит перед
 * планкой, а не сквозь неё; сквозь — ловит проверка хода).
 */
export function ceilingStack(unit: Module, run: Run): {
  ceilingMm: number;
  carcassMm: number;
  bottomMm: number;
  topMm: number;
  fillerMm: number;
  gapMm: number;
  aboveMm: number;
  /** До чего меряется место над корпусом: «до потолка», «до ригеля», «до «Антресоль» над ним». */
  limitWords: string;
  underFiller: boolean;
} {
  const ceilingMm = run.ceilingHeightMm;
  const carcassMm = Math.round(moduleCarcassHeightMm(unit, run));
  const bottomMm = Math.round(moduleFloorMm(unit, run));
  const topMm = bottomMm + carcassMm;
  const zoneTop = zoneTopOfRun(run);
  const spans = topFillerSpans(run);
  const underFiller =
    Boolean(run.topFiller) &&
    Math.abs(topMm - zoneTop) <= 1 &&
    spans.some((span) => span.fromMm < unit.offsetMm + unit.widthMm && span.toMm > unit.offsetMm);
  const fillerMm = underFiller ? (run.topFiller?.heightMm ?? 0) : 0;
  const limit = liftLimitOf(unit, run);
  return {
    ceilingMm,
    carcassMm,
    bottomMm,
    topMm,
    fillerMm,
    gapMm: Math.max(0, Math.round(limit.limitMm) - topMm - fillerMm),
    aboveMm: Math.max(0, Math.round(limit.limitMm) - topMm),
    limitWords: limit.words,
    underFiller,
  };
}

/** Толщина планки — фасадная плита цеха. */
export function topFillerThicknessMm(run: Pick<Run, 'production'>): number {
  return shopOf(run.production).frontMm;
}
