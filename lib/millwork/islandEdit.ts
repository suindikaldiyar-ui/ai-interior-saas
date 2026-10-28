/**
 * ПРАВКА ОСТРОВА — НОВЫЙ, ФОРМА, ДЛИНА, МЕСТО (OVAL & RADIUS, этап A).
 *
 * Всё, что меняет состав острова, идёт ТЕМИ ЖЕ операциями, что правят ряд у
 * стены (`applyOps`): модуль целиком на отметку (`add_module` с `module`),
 * скругление торца — `set_radius` со всеми его проверками. Второго пути
 * записи модулей нет; место острова и его столешница — поля ряда
 * (`Run.island`), и их проверяет `islandTopRefusal`.
 *
 * Ответ — новый ряд или отказ словами (`IslandEdit`): правка, которая не
 * собирается, не записывается вовсе.
 */
import type { ProductionSettings } from '@/types/catalog';
import type { IslandPlacement, MillworkOp, Run, RunRequirements } from '@/types/millwork';
import { buildRun, moduleId } from './layout';
import { CORNER } from './modules';
import { applyOps, makePlainModule } from './ops';
import { ISLAND_WALL_ID, islandEndRadiusMm, islandEnds, islandFrame, islandShapeOf, islandTopRefusal, type IslandShape } from './island';

/** Новый остров: четыре модуля по 600 — 2400 мм, как типовой остров кухни. */
export const ISLAND_MODULES_MM = [600, 600, 600, 600] as const;

export type IslandEdit = { run: Run } | { refusal: string };

/** Чем собирается остров: состав объекта, потолок и школа цеха. */
export type IslandBase = {
  requirements: RunRequirements;
  ceilingHeightMm: number;
  production?: ProductionSettings;
};

/**
 * СОСТАВ ОСТРОВА — свободная сборка без техники и без висящих рядов.
 *
 * Прибор принадлежит кухне и стоит на одной стене (ловушка 351): мойка или
 * варочная на острове — это раздача приборов композиции, а вода, слив и
 * вытяжка к острову замером не подведены. Этого этапа здесь нет, и правка
 * острова технику не ставит (`islandOpsRefusal`).
 */
export function islandRequirements(requirements: RunRequirements): RunRequirements {
  const { manualAnchors: _anchors, applianceWalls: _walls, ...rest } = requirements;
  void _anchors;
  void _walls;
  return {
    ...rest,
    mode: 'free',
    appliances: [],
    glassDisplay: false,
    options: { ...requirements.options, hasUpper: false, upperToCeiling: false },
  };
}

/** Пустой ряд острова длиной `lengthMm` на месте `placement`. */
function islandShell(base: IslandBase, lengthMm: number, placement: IslandPlacement): Run {
  const run = buildRun({
    id: ISLAND_WALL_ID,
    lengthMm,
    ceilingHeightMm: base.ceilingHeightMm,
    requirements: islandRequirements(base.requirements),
    wallId: ISLAND_WALL_ID,
    production: base.production,
  });
  return { ...run, island: placement };
}

/** Применить операции к ряду острова и не пропустить отказ: первая причина — словами. */
function applied(shell: Run, base: IslandBase, ops: MillworkOp[], expected: number): IslandEdit {
  const next = applyOps({ run: shell, requirements: islandRequirements(base.requirements), ops });
  if (next.warnings.length > 0) return { refusal: next.warnings[0] };
  if (next.modules.length !== expected) {
    return { refusal: `Остров собрался из ${next.modules.length} модулей вместо ${expected}: правка не применена.` };
  }
  const top = islandTopRefusal(next);
  return top ? { refusal: top } : { run: next };
}

/**
 * НОВЫЙ ОСТРОВ — посередине ряда стены А, фасадом к нему, проход — тот же,
 * что между рядами П-образной (`CORNER.minAisleMm`).
 */
export function newIsland(base: IslandBase, rowALengthMm: number): IslandEdit {
  const lengthMm = ISLAND_MODULES_MM.reduce((sum, width) => sum + width, 0);
  const shell = islandShell(base, lengthMm, {
    fromLeftMm: Math.max(0, Math.round((rowALengthMm - lengthMm) / 2)),
    gapMm: CORNER.minAisleMm,
    facing: 'wall',
  });
  let at = 0;
  const ops: MillworkOp[] = ISLAND_MODULES_MM.map((widthMm) => {
    const op: MillworkOp = { op: 'add_module', kind: 'base', widthMm, atMm: at };
    at += widthMm;
    return op;
  });
  return applied(shell, base, ops, ISLAND_MODULES_MM.length);
}

/** Где тело острова — прямая часть между скруглёнными торцами, мм острова. */
export function islandBodyRange(run: Pick<Run, 'modules' | 'lengthMm'>): { fromMm: number; toMm: number } {
  const { left, right } = islandEnds(run);
  return { fromMm: left ? left.offsetMm + left.widthMm : 0, toMm: right ? right.offsetMm : run.lengthMm };
}

/**
 * ОСТРОВ ЗАНОВО: торцы, тело, длина тела и столешница. Тело стоит в комнате,
 * где стояло: торец добавляется и снимается снаружи, длина растёт вправо,
 * если смотреть со стены А.
 */
function rebuilt(
  run: Run,
  base: IslandBase,
  plan: { left: boolean; right: boolean; bodyMm: number; top: IslandPlacement['top'] },
): IslandEdit {
  if (!run.island) return { refusal: 'Это не остров: у ряда нет места у стены А.' };
  if (!Number.isInteger(plan.bodyMm) || plan.bodyMm <= 0) {
    return { refusal: 'Длина острова — целое положительное число миллиметров.' };
  }
  const ends = islandEnds(run);
  const range = islandBodyRange(run);
  const R = islandEndRadiusMm(run);
  const keepLeft = plan.left ? ends.left : null;
  const keepRight = plan.right ? ends.right : null;
  const leftW = plan.left ? (keepLeft?.widthMm ?? R) : 0;
  const rightW = plan.right ? (keepRight?.widthMm ?? R) : 0;
  const body = run.modules.filter((unit) => unit !== ends.left && unit !== ends.right);
  const tooLong = body.find((unit) => unit.offsetMm - range.fromMm + unit.widthMm > plan.bodyMm);
  if (tooLong) {
    return {
      refusal: `«${tooLong.label}» кончается в ${tooLong.offsetMm - range.fromMm + tooLong.widthMm} мм от начала прямой части острова, а она будет ${plan.bodyMm} мм: сначала уберите его или сдвиньте.`,
    };
  }

  const flip = islandFrame(run).flip;
  const oldLeft = ends.left?.widthMm ?? 0;
  const oldRight = ends.right?.widthMm ?? 0;
  const at = run.island;
  const placement: IslandPlacement = {
    fromLeftMm: at.fromLeftMm + (flip ? oldRight - rightW : oldLeft - leftW),
    gapMm: at.gapMm,
    facing: at.facing,
    ...(at.backOverhangMm !== undefined ? { backOverhangMm: at.backOverhangMm } : {}),
    ...(plan.top === 'oval' ? { top: 'oval' as const } : {}),
    ...(plan.top === 'oval' && at.top === 'oval' && at.sideRadiusMm !== undefined ? { sideRadiusMm: at.sideRadiusMm } : {}),
  };
  const lengthMm = leftW + plan.bodyMm + rightW;
  const shell = islandShell(base, lengthMm, placement);

  const ops: MillworkOp[] = [];
  const endOps = (place: 'left' | 'right', kept: typeof ends.left, atMm: number) => {
    if (kept) {
      ops.push({ op: 'add_module', kind: kept.kind, module: kept, atMm });
      return;
    }
    ops.push({ op: 'add_module', kind: 'base', module: makePlainModule('base', R, ISLAND_WALL_ID), atMm });
    ops.push({
      op: 'set_radius',
      moduleId: moduleId('base', atMm, undefined, ISLAND_WALL_ID),
      radius: { place, radiusMm: R, back: true, cover: 'open' },
    });
  };
  if (plan.left) endOps('left', keepLeft, 0);
  for (const unit of body) ops.push({ op: 'add_module', kind: unit.kind, module: unit, atMm: leftW + unit.offsetMm - range.fromMm });
  if (plan.right) endOps('right', keepRight, leftW + plan.bodyMm);
  return applied(shell, base, ops, body.length + (plan.left ? 1 : 0) + (plan.right ? 1 : 0));
}

/**
 * ФОРМА ОСТРОВА: прямой, полукруглый торец (справа), капсула, овал.
 * Торцы — полуокружности R = D/2 открытыми полками; овал — капсула и
 * столешница из четырёх дуг.
 */
export function islandWithShape(run: Run, shape: IslandShape, base: IslandBase): IslandEdit {
  const range = islandBodyRange(run);
  return rebuilt(run, base, {
    left: shape === 'capsule' || shape === 'oval',
    right: shape !== 'rect',
    bodyMm: range.toMm - range.fromMm,
    top: shape === 'oval' ? 'oval' : undefined,
  });
}

/** ДЛИНА ПРЯМОЙ ЧАСТИ ОСТРОВА — торцы те же, модули тела на своих местах. */
export function islandWithBodyLength(run: Run, bodyMm: number, base: IslandBase): IslandEdit {
  const ends = islandEnds(run);
  return rebuilt(run, base, {
    left: Boolean(ends.left),
    right: Boolean(ends.right),
    bodyMm,
    top: islandShapeOf(run) === 'oval' ? 'oval' : undefined,
  });
}

/**
 * МЕСТО И СТОЛЕШНИЦА ОСТРОВА — поля ряда, модули не трогаются: от левого
 * края ряда А, проход между фасадами, куда смотрит фасад, свес с тыла,
 * радиус боковой дуги овала.
 */
export function islandWithPlacement(run: Run, patch: Partial<IslandPlacement>): IslandEdit {
  if (!run.island) return { refusal: 'Это не остров: у ряда нет места у стены А.' };
  const next: IslandPlacement = { ...run.island, ...patch };
  if (!Number.isInteger(next.fromLeftMm)) return { refusal: 'Отметка острова — целое число миллиметров от левого края ряда стены А.' };
  if (!Number.isInteger(next.gapMm) || next.gapMm < 0) {
    return { refusal: 'Проход между островом и рядом стены А — целое число миллиметров, не меньше нуля.' };
  }
  const placed: Run = { ...run, island: next };
  const top = islandTopRefusal(placed);
  return top ? { refusal: top } : { run: placed };
}

/**
 * ТЕХНИКИ НА ОСТРОВЕ В ЭТОМ ЭТАПЕ НЕТ — словами, до правки.
 *
 * Мойка и варочная на острове требуют воды, слива и вытяжки, которых замер
 * к острову не подводит, а прибор, поставленный мимо композиции, стал бы
 * вторым на кухне (ловушка 351).
 */
export function islandOpsRefusal(ops: MillworkOp[]): string | null {
  const appliance = ops.some(
    (op) =>
      ((op.op === 'add_module' || op.op === 'replace_module') && (op.appliance || ('module' in op && op.module?.appliance))) ||
      (op.op === 'set_option' && op.key === 'hasUpper' && op.value === true),
  );
  return appliance
    ? 'На острове техники и навесного ряда нет: мойка и варочная требуют воды, слива и вытяжки, которых замер к острову не подводит, а прибор кухни стоит на одной стене.'
    : null;
}
