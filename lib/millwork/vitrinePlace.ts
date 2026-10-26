/**
 * МЕСТО ВИТРИНЫ (P1) — ПРОВЕРКИ, КОТОРЫМ НУЖЕН РЯД.
 *
 * Сама витрина ставится теми же функциями, что любой модуль: низ — одна
 * `upperBottomFor` (на столешнице — рабочая поверхность), высота — одна
 * `moduleCarcassHeightMm`, глубина — одна `moduleDepthMm`. Здесь только
 * ответ ДО записи: встанет ли витрина на это место, — словами, с
 * миллиметрами, чтобы правку не пришлось отменять после.
 */
import type { MillworkOp, Module, Run } from '@/types/millwork';
import { countertopSlabs } from './countertop';
import { counterSlabDepthMm, hasMezzanine, MAX_APPLIANCE_DEPTH_MM, mezzanineBottomMm, rowStandardDepthMm } from './fill';
import { ceilingOverModuleMm } from './ceiling';
import { plinthMm, workTopMm } from './shop';
import { SINGLE_DOOR_MAX_MM, frontPlan, standsOnFloor } from './modules';
import { MODULE_VARIANTS } from './moduleVariants';
import { hasCutFrame } from './glass';
import { upperRowBottomMm, zoneHeightMm } from './zones';
import { VITRINE_MIN_DEPTH_MM, VITRINE_MIN_HEIGHT_MM, storedVitrine, vitrineOf, vitrineSpecRefusal } from './vitrine';

type RowShell = Pick<Run, 'modules' | 'zone' | 'ceilingHeightMm' | 'lengthMm' | 'corner' | 'production'> & Partial<Run>;

/** Что стоит под отрезком верхнего ряда — модули нижнего ряда, задевающие его. */
function modulesBelow(unit: Pick<Module, 'offsetMm' | 'widthMm'>, run: Pick<Run, 'modules'>): Module[] {
  const from = unit.offsetMm;
  const to = unit.offsetMm + unit.widthMm;
  return run.modules.filter((m) => m.offsetMm < to && from < m.offsetMm + m.widthMm);
}

/**
 * ВСТАНЕТ ЛИ ВИТРИНА НА СТОЛЕШНИЦУ — словами; `null` — встанет.
 *
 * Плита под витриной обязана быть сплошной на всю её ширину (`countertopSlabs`
 * — та же плита, что рисует сцена и считает смета); над мойкой и варочной
 * витрину не ставят: мойкой не воспользоваться, жар и пар идут в стекло.
 */
export function counterRefusal(unit: Module, run: RowShell): string | null {
  const name = `«${unit.label || 'витрина'}»`;
  const below = modulesBelow(unit, run);
  if (below.length === 0) return `${name}: под витриной нет нижних модулей — столешницы, на которую её ставить, нет.`;
  const sink = below.find((m) => m.appliance?.startsWith('sink'));
  if (sink) return `${name}: над мойкой витрина на столешнице закроет кран и чашу — мойкой не воспользоваться.`;
  const hob = below.find((m) => m.appliance === 'hob');
  if (hob) return `${name}: над варочной панелью жар и пар идут прямо в стекло — витрину на столешницу здесь не ставят.`;
  const from = unit.offsetMm;
  const to = unit.offsetMm + unit.widthMm;
  const slab = countertopSlabs(run).find((s) => s.fromMm <= from && to <= s.toMm);
  if (!slab) {
    const pieces = countertopSlabs(run)
      .filter((s) => s.toMm > from && s.fromMm < to)
      .map((s) => `${Math.max(s.fromMm, from)}…${Math.min(s.toMm, to)}`);
    return `${name}: под витриной (${from}…${to} мм) столешница не сплошная${pieces.length ? ` — плита только на ${pieces.join(', ')} мм` : ''}: стекло встало бы над пустотой.`;
  }
  return null;
}

/** Низ витрины от пола — той же отметкой, что ставит её `upperBottomFor`. */
function bottomOf(unit: Module, run: RowShell, onCounter: boolean): number {
  if (standsOnFloor(unit)) return plinthMm(run.production);
  if (onCounter) return workTopMm(run.production);
  return upperRowBottomMm(run.zone, run.ceilingHeightMm, 0, run.production);
}

/**
 * ВСТАНЕТ ЛИ ВИТРИНА СВОЕЙ ВЫСОТЫ — словами; `null` — встанет.
 *
 * Верх — не выше потолка над её местом (с ригелем — низа ригеля) и, у
 * навесной витрины, не выше низа антресоли ряда: антресоль стоит на
 * верхнем ряду, и витрина выше вошла бы в неё.
 */
export function vitrineHeightRefusal(unit: Module, run: RowShell, heightMm: number, onCounter: boolean): string | null {
  const name = `«${unit.label || 'витрина'}»`;
  if (unit.section === 'mezzanine') return `${name}: высоту антресоли задаёт её ряд — у одного модуля она своей не бывает.`;
  if (unit.overhead) return `${name}: высоту корпуса над шкафом задаёт его блок «Корпус над шкафом».`;
  if (!Number.isFinite(heightMm) || heightMm < VITRINE_MIN_HEIGHT_MM) {
    return `${name}: высота ${Math.round(heightMm)} мм — ниже ${VITRINE_MIN_HEIGHT_MM} мм полка в витрину не встанет.`;
  }
  const bottom = bottomOf(unit, run, onCounter);
  const ceiling = Math.min(ceilingOverModuleMm(unit, run), zoneHeightMm(run.zone, run.ceilingHeightMm));
  const limit = !standsOnFloor(unit) && hasMezzanine(run) ? Math.min(ceiling, mezzanineBottomMm(run)) : ceiling;
  if (bottom + heightMm > limit) {
    const what = limit < ceiling ? 'низа антресоли' : ceiling < zoneHeightMm(run.zone, run.ceilingHeightMm) ? 'низа ригеля' : 'потолка';
    return `${name}: ${Math.round(heightMm)} мм не встают — от ${bottom} мм до ${what} ${limit} мм остаётся ${limit - bottom} мм.`;
  }
  return null;
}

/**
 * ВСТАНЕТ ЛИ ВИТРИНА СВОЕЙ ГЛУБИНЫ — словами; `null` — встанет.
 *
 * Задняя плоскость на стене, уходит передняя. На столешнице витрина не
 * свешивается за край плиты; навесная — не глубже нижнего ряда (иначе
 * нависает над краем столешницы на уровне головы); высокая — не глубже
 * прибора, который встраивают в ряд.
 */
export function vitrineDepthRefusal(unit: Module, run: RowShell, depthMm: number, onCounter: boolean): string | null {
  const name = `«${unit.label || 'витрина'}»`;
  if (!Number.isFinite(depthMm) || depthMm < VITRINE_MIN_DEPTH_MM) {
    return `${name}: глубина ${Math.round(depthMm)} мм — мельче ${VITRINE_MIN_DEPTH_MM} мм полка не встанет.`;
  }
  if (standsOnFloor(unit)) {
    return depthMm > MAX_APPLIANCE_DEPTH_MM
      ? `${name}: глубже ${MAX_APPLIANCE_DEPTH_MM} мм ряд выступает в проход — о такой выступ бьются коленом.`
      : null;
  }
  if (onCounter) {
    const slab = counterSlabDepthMm(run.zone, run.production);
    return depthMm > slab ? `${name}: ${depthMm} мм глубже столешницы (${slab} мм) — витрина свешивалась бы за край плиты.` : null;
  }
  const base = rowStandardDepthMm(run.zone, 'base', run.production);
  return depthMm > base
    ? `${name}: навесная витрина глубже нижнего ряда (${base} мм) нависает над краем столешницы на уровне головы.`
    : null;
}

/** Две стеклянные двери — от этой ширины: та же граница, что у варианта «Две дверцы». */
const TWO_DOORS_MIN_MM = MODULE_VARIANTS.door_two.minWidthMm;

type VitrineOp = Extract<MillworkOp, { op: 'set_vitrine' }>;

/** Подпись модуля без витрины — та же, что даёт раскладка («Дверца», «2 дверцы»). */
function plainLabel(unit: Pick<Module, 'kind' | 'doorCount'>): string {
  if (unit.kind === 'tall') return 'Пенал';
  return unit.doorCount >= 2 ? `${unit.doorCount} дверцы` : 'Дверца';
}

/**
 * ПРАВКА ВИТРИНЫ ЦЕЛИКОМ (P1) — что станет с модулем, или отказ словами.
 *
 * Спецификация пишется без умолчаний (`storedVitrine`). Открытый модуль,
 * ставший витриной, получает двери по ширине — тем же правилом, что
 * раскладка (`frontPlan`). Снятая витрина у варианта со стеклом уносит и
 * вариант: иначе модуль остался бы витриной по варианту. Секцию-витрину
 * снимают сменой секции — это другая начинка ряда, а не фасад.
 */
export function vitrineEdit(
  unit: Module,
  op: VitrineOp,
  run: RowShell,
  cornerOf?: (unit: Module) => 'corner' | 'closed' | null,
): { unit: Module; note?: string } | { refusal: string } {
  const name = `«${unit.label || 'модуль'}»`;
  const was = vitrineOf(unit);

  if (op.vitrine === null) {
    if (!was) return { refusal: `${name}: модуль и так не витрина.` };
    if (unit.section === 'glass_display') {
      return {
        refusal: `${name} — секция «Витрина с подсветкой»: снимается сменой секции в «Секция» (на кухне — кнопкой «Витрина с подсветкой» в составе).`,
      };
    }
    const { vitrine: _spec, ...rest } = unit;
    void _spec;
    const fromVariant = Boolean(unit.variant && MODULE_VARIANTS[unit.variant]?.transparentFront);
    const next: Module = { ...rest, ...(fromVariant ? { variant: undefined } : {}) };
    next.label = plainLabel(next);
    /* Своя высота навесной витрины — свойство витрины: снята витрина — шкаф снова в ряду. */
    if (!standsOnFloor(unit) && !unit.overhead) delete next.heightMm;
    /*
     * Вид стекла и стеклянные полки — свойства стекла: у модуля без стекла они
     * ни на что бы не влияли, а отпечаток сдвигали. Остаются, только если на
     * двери рама KIRA со сквозными окнами — стекло за ней есть.
     */
    const lost: string[] = [];
    if (!hasCutFrame(next, run)) {
      if (next.glass) {
        delete next.glass;
        lost.push('вид стекла');
      }
      if (next.glassShelves) {
        delete next.glassShelves;
        lost.push('стеклянные полки — снова из плиты');
      }
    }
    const notes = [
      ...(was.onCounter ? [`${name}: витрина снята — шкаф снова висит на отметке верхнего ряда, а не стоит на столешнице.`] : []),
      ...(lost.length > 0 ? [`${name}: вместе с витриной сняты ${lost.join(' и ')}.`] : []),
    ];
    return { unit: next, ...(notes.length > 0 ? { note: notes.join(' ') } : {}) };
  }

  const spec = op.vitrine;
  const refusal = vitrineSpecRefusal(unit, run, spec);
  if (refusal) return { refusal };
  if (cornerOf?.(unit) === 'corner') {
    return {
      refusal: `${name}: створка у слепого угла висит на угловых петлях 175°, а под алюминиевую рамку таких в каталоге нет — витриной этот модуль не сделать.`,
    };
  }
  /* Рама KIRA — дверь МДФ под стекло; у цельностеклянной дверь — стекло без рамки (та же граница, что `vitrineFrameRefusal`). */
  if (spec.construction === 'glass' && hasCutFrame(unit, run)) {
    return {
      refusal: `${name}: на двери стоит рама витрины МДФ — у цельностеклянной витрины дверь из стекла без рамки. Снимите раму во вкладке «МДФ фасады» или оставьте «Корпус и стеклянная дверь».`,
    };
  }
  const onCounter = spec.onCounter === true;
  if (onCounter) {
    const counter = counterRefusal(unit, run);
    if (counter) return { refusal: counter };
  }
  if (op.heightMm !== undefined && op.heightMm !== null) {
    const height = vitrineHeightRefusal(unit, run, op.heightMm, onCounter);
    if (height) return { refusal: height };
  }
  if (spec.depthMm !== undefined) {
    const depth = vitrineDepthRefusal(unit, run, spec.depthMm, onCounter);
    if (depth) return { refusal: depth };
  }

  let next: Module = { ...unit };
  const stored = storedVitrine(unit, spec);
  if (stored) next.vitrine = stored;
  else delete next.vitrine;
  if (op.heightMm === null) delete next.heightMm;
  else if (op.heightMm !== undefined) next.heightMm = Math.round(op.heightMm);

  /* Открытый модуль, ставший витриной, закрывается стеклянными дверями по ширине. */
  if (next.frontType === 'none' && next.section !== 'glass_display') {
    next = { ...next, frontType: 'door', doorCount: frontPlan(next.kind, next.widthMm).doorCount };
  }

  if (op.doors !== undefined) {
    if (op.doors === 2 && unit.widthMm < TWO_DOORS_MIN_MM) {
      return { refusal: `${name}: две двери — от ${TWO_DOORS_MIN_MM} мм, а модуль ${unit.widthMm} мм: каждая вышла бы уже ${Math.floor(TWO_DOORS_MIN_MM / 2)} мм.` };
    }
    if (op.doors === 1 && unit.widthMm > SINGLE_DOOR_MAX_MM) {
      return { refusal: `${name}: одна дверь шире ${SINGLE_DOOR_MAX_MM} мм провисает на петлях — при ${unit.widthMm} мм дверей две.` };
    }
    const hinge = next.fill?.hinge;
    next = {
      ...next,
      frontType: 'door',
      doorCount: op.doors,
      ...(next.fill
        ? {
            fill: {
              ...next.fill,
              hinge: op.doors === 2 ? 'double' : hinge === 'double' || hinge === 'none' || hinge === undefined ? 'left' : hinge,
            },
          }
        : {}),
    };
  }

  if (!was) next.label = 'Витрина';
  return { unit: next };
}
