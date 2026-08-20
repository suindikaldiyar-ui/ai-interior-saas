import { APPLIANCE_SLOTS, MIN_WIDTH, frontPlan, isStandardWidth, snapToStandard } from './modules';
import { buildUpperRow, fillGap } from './layout';
import type {
  ApplianceKind,
  MillworkOp,
  Module,
  ModuleKind,
  Opening,
  Run,
  RunRequirements,
} from '@/types/millwork';

/**
 * Применение операций редактирования к ряду.
 *
 * Модель возвращает ОПЕРАЦИИ НАД СПИСКОМ МОДУЛЕЙ, а не числа. Ширины,
 * количество фасадов и позиции пересчитывает код: тогда «убери пенал»
 * из чата и то же действие мышью дают один и тот же результат, а смета
 * остаётся воспроизводимой.
 */

function reindex(modules: Module[]): Module[] {
  let offset = 0;
  return modules.map((unit) => {
    const next: Module = {
      ...unit,
      offsetMm: offset,
      id: `${unit.kind}-${offset}${unit.appliance ? `-${unit.appliance}` : ''}`,
      isFiller: unit.kind === 'filler' || !isStandardWidth(unit.widthMm),
    };
    offset += unit.widthMm;
    return next;
  });
}

/**
 * После правок сумма ширин обязана снова сойтись с длиной ряда.
 * Недостачу закрываем стандартными модулями, излишек снимаем с обычных
 * модулей — технику трогать нельзя, у неё габарит фиксирован.
 */
function rebalance(modules: Module[], lengthMm: number): Module[] {
  const sum = modules.reduce((acc, m) => acc + m.widthMm, 0);
  let diff = lengthMm - sum;

  if (diff === 0) return reindex(modules);

  if (diff > 0) {
    const added = fillGap(diff).map((widthMm) =>
      makePlainModule('base', widthMm),
    );
    return reindex([...modules, ...added]);
  }

  // Излишек: ужимаем и удаляем обычные модули, начиная с последнего.
  const result = [...modules];
  for (let i = result.length - 1; i >= 0 && diff < 0; i--) {
    const unit = result[i];
    if (unit.appliance || unit.kind === 'tall' || unit.kind === 'corner_base') continue;

    const canShrink = unit.widthMm - MIN_WIDTH;
    if (canShrink >= -diff) {
      result[i] = { ...unit, widthMm: unit.widthMm + diff };
      diff = 0;
    } else {
      diff += unit.widthMm;
      result.splice(i, 1);
    }
  }

  return reindex(result);
}

function makePlainModule(kind: ModuleKind, widthMm: number, appliance?: ApplianceKind): Module {
  const fronts = appliance ? { doorCount: 0, drawerCount: 0 } : frontPlan(kind, widthMm);
  return {
    id: `${kind}-0${appliance ? `-${appliance}` : ''}`,
    kind,
    widthMm,
    offsetMm: 0,
    appliance,
    frontType: appliance ? 'appliance' : fronts.drawerCount > 0 ? 'drawers' : 'door',
    drawerCount: fronts.drawerCount,
    doorCount: fronts.doorCount,
    isFiller: !isStandardWidth(widthMm),
    label: appliance ? APPLIANCE_SLOTS[appliance].title : kind === 'tall' ? 'Пенал' : String(widthMm),
  };
}

export interface ApplyOpsInput {
  run: Run;
  requirements: RunRequirements;
  ops: MillworkOp[];
  openings?: Opening[];
}

export function applyOps({ run, requirements, ops, openings = [] }: ApplyOpsInput): Run {
  let modules = [...run.modules];
  let options = { ...run.options };
  const warnings: string[] = [];

  for (const op of ops) {
    switch (op.op) {
      case 'add_module': {
        const width = op.appliance
          ? APPLIANCE_SLOTS[op.appliance].widthMm
          : snapToStandard(op.widthMm ?? 600);
        const created = makePlainModule(op.kind, width, op.appliance);
        const at = op.afterModuleId
          ? modules.findIndex((m) => m.id === op.afterModuleId)
          : modules.length - 1;
        modules.splice(at + 1, 0, created);
        break;
      }

      case 'remove_module': {
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at >= 0) modules.splice(at, 1);
        else warnings.push(`Модуль ${op.moduleId} не найден.`);
        break;
      }

      case 'replace_module': {
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }
        const width = op.appliance
          ? APPLIANCE_SLOTS[op.appliance].widthMm
          : modules[at].widthMm;
        modules[at] = makePlainModule(op.kind, width, op.appliance);
        break;
      }

      case 'set_width': {
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) break;
        if (modules[at].appliance) {
          // Габарит техники фиксирован стандартом, менять его нельзя.
          warnings.push(`${modules[at].label}: ширина техники не меняется.`);
          break;
        }
        modules[at] = { ...modules[at], widthMm: snapToStandard(op.widthMm) };
        break;
      }

      case 'set_fronts': {
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0 || modules[at].appliance) break;
        const fronts = frontPlan(modules[at].kind, modules[at].widthMm, op.drawerCount);
        modules[at] = {
          ...modules[at],
          frontType: fronts.drawerCount > 0 ? 'drawers' : 'door',
          drawerCount: fronts.drawerCount,
          doorCount: fronts.doorCount,
        };
        break;
      }

      case 'move_module': {
        const from = modules.findIndex((m) => m.id === op.moduleId);
        const to = modules.findIndex((m) => m.id === op.afterModuleId);
        if (from < 0 || to < 0 || from === to) break;
        const [moved] = modules.splice(from, 1);
        const insertAt = modules.findIndex((m) => m.id === op.afterModuleId);
        modules.splice(insertAt + 1, 0, moved);
        break;
      }

      case 'set_option': {
        if (op.key === 'hardwareClass' && typeof op.value === 'string') {
          options.hardwareClass = op.value as Run['options']['hardwareClass'];
        } else if (op.key === 'countertop' && typeof op.value === 'string') {
          options.countertop = op.value as Run['options']['countertop'];
        } else if (typeof op.value === 'boolean') {
          options = { ...options, [op.key]: op.value };
        }
        break;
      }
    }
  }

  modules = rebalance(modules, run.lengthMm);

  const nextRun: Run = {
    ...run,
    modules,
    options,
    residualMm: run.lengthMm - modules.reduce((sum, m) => sum + m.widthMm, 0),
    warnings,
  };

  nextRun.upperSegments = options.hasUpper
    ? buildUpperRow(
        modules,
        run.lengthMm,
        openings,
        { ...requirements, options },
        run.ceilingHeightMm,
      )
    : [];

  return nextRun;
}
