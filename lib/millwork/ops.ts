import {
  APPLIANCE_SLOTS,
  MAX_WIDTH,
  MIN_WIDTH,
  frontPlan,
  isStandardWidth,
  snapToStandard,
} from './modules';
import { buildUpperRow, fillGap } from './layout';
import { assertNoOverlap, assertRunFits, widthOverflowMm } from './invariants';
import { runFingerprint } from './fingerprint';
import { defaultFill, hingeSide } from './fill';
import {
  moveConflict,
  moveRefusal,
  placeFree,
  placementFor,
  snapMove,
} from './freeRun';
import { SECTION_SPECS } from './sections';
import { allowsAppliance, allowsSection, applianceRefusal, sectionRefusal } from './zones';
import { MODULE_VARIANTS, applyVariant, variantsForModule } from './moduleVariants';
import type {
  ApplianceKind,
  MillworkOp,
  Module,
  ModuleKind,
  Opening,
  Run,
  RunRequirements,
  SectionKind,
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
    label: appliance
      ? APPLIANCE_SLOTS[appliance].title
      : kind === 'tall'
        ? 'Пенал'
        : fronts.drawerCount > 0
          ? `${fronts.drawerCount} ящика`
          : fronts.doorCount >= 2
            ? `${fronts.doorCount} дверцы`
            : 'Дверца',
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

  const zone = requirements.zone ?? run.zone ?? 'kitchen';
  /** Правки верхнего ряда: он пересобирается в конце, они применяются после. */
  const upperEdits = new Map<string, NonNullable<Module['variant']>>();

  for (const op of ops) {
    /*
     * НИ ОДНОГО ЧУЖОГО ЭЛЕМЕНТА, откуда бы операция ни пришла — из ленты
     * модулей, из командной строки или от модели. Отказ называет причину:
     * «в зоне «спальня» посудомойки не бывает» объясняет мир, а молчание
     * выглядит поломкой.
     */
    const appliance =
      op.op === 'add_module' || op.op === 'replace_module' ? op.appliance : undefined;

    if (appliance && !allowsAppliance(zone, appliance)) {
      warnings.push(applianceRefusal(zone, appliance));
      continue;
    }

    if (op.op === 'set_section' && !allowsSection(zone, op.section)) {
      warnings.push(sectionRefusal(zone, op.section));
      continue;
    }

    switch (op.op) {
      case 'add_module': {
        const width = op.appliance
          ? APPLIANCE_SLOTS[op.appliance].widthMm
          : snapToStandard(op.widthMm ?? 600);

        /*
         * В СВОБОДНОЙ СБОРКЕ МЕСТО НЕ РАСТЯГИВАЕТСЯ.
         *
         * В раскладке по шаблону `rebalance` потом ужмёт соседей и всё
         * сойдётся. Здесь соседей никто не трогает, поэтому модуль,
         * которому не хватает стены, не добавляется вовсе — и отказ
         * называет, сколько миллиметров не хватило. Иначе `assertRunFits`
         * уронил бы ВСЮ правку исключением, а человек всего лишь нажал
         * «добавить».
         */
        if (requirements.mode === 'free') {
          const busy = modules.reduce((sum, m) => sum + m.widthMm, 0);
          const short = busy + width - run.lengthMm;
          if (short > 0) {
            warnings.push(
              `Не хватает ${short} мм: свободно ${run.lengthMm - busy} мм, ` +
                `а модуль ${width} мм.`,
            );
            break;
          }
        }

        const created = makePlainModule(op.kind, width, op.appliance);

        /*
         * Холодильник, добавленный руками, встраивается по тем же
         * умолчаниям, что и поставленный раскладкой (`planAnchors`).
         * Иначе один и тот же состав стоил бы разных денег и выглядел
         * по-разному в зависимости от того, как его собрали.
         */
        if (op.appliance === 'fridge') {
          created.builtIn = (requirements.fridgeType ?? 'built_in') === 'built_in';
        }


        /*
         * В СВОБОДНОЙ СБОРКЕ У МОДУЛЯ ЕСТЬ МЕСТО, А НЕ ТОЛЬКО ПОРЯДОК.
         *
         * Удалённый посреди ряда модуль оставляет дырку там, где стоял:
         * ряд не схлопывается. Значит добавлять надо В ПРОМЕЖУТОК —
         * сначала за выделенным модулем, куда человек и показывал, потом
         * в первый подходящий слева направо.
         */
        if (requirements.mode === 'free') {
          const at0 = placementFor(modules, run.lengthMm, width, op.afterModuleId);
          if (at0 === null) {
            warnings.push(
              `Некуда поставить модуль ${width} мм: ` +
                `свободные места ряда уже, чем он.`,
            );
            break;
          }
          created.offsetMm = at0;
          /*
           * Вариант применяется ЗДЕСЬ ЖЕ, одной операцией.
           *
           * Иначе «+» ставит пустое место, а начинку ему выбирают вторым
           * жестом на другом экране — и половина модулей остаётся
           * дверцами просто потому, что второй жест никто не сделал.
           */
          modules.push(op.variant ? applyVariant(created, op.variant) : created);
          break;
        }

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
          // Габарит техники фиксирован прибором, менять его нельзя.
          warnings.push(`${modules[at].label}: ширина техники не меняется.`);
          break;
        }

        /*
         * Ширина вводится числом: корпусную мебель делают на заказ, и сам
         * buildRun раздаёт остаток модулями вроде 630 мм. Стандарт остаётся
         * подсказкой, а не рамкой.
         */
        const wanted = Math.round(op.widthMm);
        if (!Number.isFinite(wanted) || wanted < MIN_WIDTH || wanted > MAX_WIDTH) {
          warnings.push(`Ширина модуля — от ${MIN_WIDTH} до ${MAX_WIDTH} мм.`);
          break;
        }

        /*
         * ПРОВЕРКА ПОМЕЩАЕМОСТИ РАЗНАЯ В ДВУХ РЕЖИМАХ.
         *
         * `widthOverflowMm` считает МИНИМАЛЬНО возможную сумму: техника и
         * пеналы держат габарит, обычные модули ужимаются до `MIN_WIDTH`.
         * Это верно для шаблона — там `rebalance` действительно ужмёт
         * соседей и всё сойдётся.
         *
         * В свободной сборке соседей никто не трогает, и та же проверка
         * пропускала правку, после которой ряд вылезал за стену: дальше
         * `assertRunFits` роняла ВСЮ правку исключением — то есть рабочее
         * место человека — вместо отказа с числом. Поэтому здесь сумма
         * считается по фактическим ширинам.
         */
        const over =
          requirements.mode === 'free'
            ? modules.reduce((sum, m) => sum + m.widthMm, 0) -
              modules[at].widthMm +
              wanted -
              run.lengthMm
            : widthOverflowMm({ modules, lengthMm: run.lengthMm }, op.moduleId, wanted, MIN_WIDTH);
        if (over > 0) {
          warnings.push(`${wanted} мм не помещается: ряд длиннее стены на ${over} мм.`);
          break;
        }

        /*
         * И НЕ НАЕЗЖАЕТ НА СОСЕДА.
         *
         * Проверка выше отвечает только за стену: в свободной сборке
         * между модулями бывает пустое место, и «в стену помещается» не
         * значит «здесь помещается». Растущий модуль съел бы соседа,
         * а `assertRunFits` уронила бы всю правку исключением.
         */
        if (requirements.mode === 'free') {
          const grown = { ...modules[at], widthMm: wanted };
          const conflict = moveConflict(
            modules.map((m) => (m.id === grown.id ? grown : m)),
            grown.id,
            grown.offsetMm,
            run.lengthMm,
          );
          if (conflict) {
            warnings.push(
              `${wanted} мм не встают: справа «${conflict.blockedBy.label}», ` +
                `не хватает ${conflict.overlapMm} мм.`,
            );
            break;
          }
        }

        modules[at] = { ...modules[at], widthMm: wanted };
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

      /*
       * Смена начинки в зонах без техники. Секция задаёт и тип модуля,
       * и фасад: пенал под пальто и тумба под раковину — это свойства
       * секции, а не выбор в отдельном списке.
       */
      case 'set_section': {
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        const spec = SECTION_SPECS[op.section as SectionKind];
        const width = modules[at].widthMm;
        const fronts =
          spec.frontType === 'drawers'
            ? frontPlan(spec.moduleKind, width, spec.drawerCount)
            : frontPlan(spec.moduleKind, width);

        modules[at] = {
          ...modules[at],
          kind: spec.moduleKind,
          section: op.section,
          label: spec.title,
          frontType: spec.frontType,
          drawerCount: spec.frontType === 'drawers' ? fronts.drawerCount : 0,
          doorCount: spec.frontType === 'door' ? fronts.doorCount : 0,
          // Наполнение считается заново: полки и штанга у секций разные.
          fill: undefined,
        };
        break;
      }

      /*
       * Смена варианта места: карго вместо дверцы, сушилка над мойкой.
       * Проверяем ЗДЕСЬ тоже, а не только в интерфейсе: операция приходит
       * и от модели, и из командной строки.
       */
      case 'set_variant': {
        /*
         * Вариант меняется и в нижнем ряду, и в верхнем: сушилка живёт
         * наверху, карго внизу. Ищем в обоих, иначе половина каталога
         * оказалась бы недоступной.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        const upperUnit = at < 0
          ? run.upperSegments.flatMap((segment) => segment.modules).find((m) => m.id === op.moduleId)
          : null;

        const target = at >= 0 ? modules[at] : upperUnit;
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        const allowed = variantsForModule(target, { ...run, modules }, zone);
        if (!allowed.some((spec) => spec.kind === op.variant)) {
          warnings.push(
            `${MODULE_VARIANTS[op.variant].title}: в это место не встаёт — ` +
              `ширина ${target.widthMm} мм или не то место в ряду.`,
          );
          break;
        }

        if (at >= 0) modules[at] = applyVariant(modules[at], op.variant);
        else upperEdits.set(target.id, op.variant);
        break;
      }

      case 'move_module': {
        /*
         * ДВА ВИДА ПЕРЕНОСА.
         *
         * `afterModuleId` — перестановка в ПОРЯДКЕ: так правит модель и
         * так двигали модули в раскладке по шаблону, где позиция всё равно
         * пересчитается из суммы ширин.
         *
         * `offsetMm` — перенос НА МЕСТО, и это то, что делает рука
         * мебельщика в свободной сборке: модуль едет вдоль ряда шагом
         * 50 мм и встаёт туда, где пусто. Соседи при этом не двигаются.
         */
        if (op.offsetMm !== undefined) {
          const at = modules.findIndex((m) => m.id === op.moduleId);
          if (at < 0) {
            warnings.push(`Модуль ${op.moduleId} не найден.`);
            break;
          }

          const unit = modules[at];
          const wanted = Math.min(
            Math.max(0, snapMove(op.offsetMm)),
            Math.max(0, run.lengthMm - unit.widthMm),
          );

          const conflict = moveConflict(modules, unit.id, wanted, run.lengthMm);
          if (conflict) {
            warnings.push(moveRefusal(conflict));
            break;
          }

          modules[at] = { ...unit, offsetMm: wanted };
          break;
        }

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

  /*
   * ПЕРЕЗАПОЛНЕНИЕ ТОЛЬКО В РЕЖИМЕ ШАБЛОНА.
   *
   * `rebalance` дозаполняет недостачу стандартными модулями и снимает
   * излишек с соседей — для раскладки по шаблону это правильно: ряд там
   * обязан сходиться со стеной до миллиметра.
   *
   * В свободной сборке это отнимает у человека контроль: удалил модуль —
   * на его месте немедленно вырос другой; потянул ширину — соседи молча
   * ужались. Поэтому здесь ряд остаётся ровно таким, каким его собрали,
   * а незаполненный остаток показывается числом.
   */
  const free = requirements.mode === 'free';
  modules = free ? placeFree(modules) : rebalance(modules, run.lengthMm);

  /*
   * Наполнение пересчитывается там, где оно слетело со сменой секции:
   * чертёж, смета и детализировка обязаны видеть одну мебель.
   */
  const shell = { zone, ceilingHeightMm: run.ceilingHeightMm, options };
  modules = modules.map((unit, i) => {
    if (!unit.fill) return { ...unit, fill: defaultFill(unit, shell, i, modules.length) };

    /*
     * СТОРОНА ПЕТЕЛЬ ВЫВОДИТСЯ ИЗ МЕСТА В РЯДУ, а не запоминается.
     *
     * Полки и ящики — выбор человека, их пересчитывать нельзя. А сторона
     * открывания зависит только от того, где модуль стоит: створки
     * распахиваются от середины ряда наружу. Добавили модуль слева —
     * соседи поехали, и петли обязаны переехать с ними.
     *
     * Без этого один и тот же состав давал разные отпечатки: собранный
     * по шаблону и собранный руками отличались стороной петель, потому
     * что при ручной сборке она застывала на момент добавления.
     */
    const hinge = hingeSide(unit, i, modules.length);
    return unit.fill.hinge === hinge ? unit : { ...unit, fill: { ...unit.fill, hinge } };
  });

  const nextRun: Run = {
    ...run,
    modules,
    options,
    residualMm: run.lengthMm - modules.reduce((sum, m) => sum + m.widthMm, 0),
    warnings,
  };

  /*
   * Верхний ряд пересобирается заново из нижнего, поэтому выбранные там
   * варианты нужно вернуть. Идентификатор модуля выводится из позиции:
   * не тронули низ — верхний модуль тот же, и сушилка над мойкой остаётся.
   * Сдвинули низ — модуль другой, и выбор честно теряется.
   */
  const upperVariants = new Map([
    ...run.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((unit) => unit.variant)
      .map((unit) => [unit.id, unit.variant!] as const),
    ...Array.from(upperEdits.entries()),
  ]);

  nextRun.upperSegments = options.hasUpper
    ? buildUpperRow(
        modules,
        run.lengthMm,
        openings,
        { ...requirements, options },
        run.ceilingHeightMm,
      )
    : [];

  /*
   * ВЕРХНИЙ РЯД ТОЖЕ ПОЛУЧАЕТ НАПОЛНЕНИЕ.
   *
   * `buildUpperRow` его не считает — это делает `buildRun` отдельным
   * проходом по обоим рядам, — а здесь верхний ряд пересобирается сам по
   * себе. Без этой строки после ЛЮБОЙ правки все верхние модули оставались
   * без `fill`: полки пропадали из раскроя (цех недопиливал), из разреза
   * «с наполнением» и из 3D. В смете это не было видно, потому что она
   * считала по одной полке на модуль независимо от `fill`, — маскировка
   * держалась ровно до того дня, когда смету научили читать данные.
   *
   * `applyVariant` обнуляет `fill` намеренно (у карго и сушилки начинка
   * своя), поэтому пересчёт идёт ПОСЛЕ восстановления вариантов.
   */
  nextRun.upperSegments = nextRun.upperSegments.map((segment) => {
    const restored = segment.modules.map((unit) => {
      const kept = upperVariants.get(unit.id);
      return kept && !unit.appliance ? applyVariant(unit, kept) : unit;
    });

    return {
      ...segment,
      modules: restored.map((unit, i) =>
        unit.fill ? unit : { ...unit, fill: defaultFill(unit, shell, i, restored.length) },
      ),
    };
  });

  // Отпечаток пересчитывается вместе с составом — иначе смета и чертёж
  // разойдутся молча, а это ровно то, от чего он защищает.
  nextRun.fingerprint = runFingerprint(nextRun);

  // Тот же инвариант, что и в buildRun: правки не могут вывести ряд за стену.
  assertRunFits(nextRun);
  // Два модуля в одном объёме собрать нельзя, а смета посчитает их дважды.
  assertNoOverlap(nextRun);

  return nextRun;
}
