import type { MillworkOp, Module, Run } from '@/types/millwork';
import { moduleById } from './selection';
import { mezzanineBaseOf } from './fill';
import { MIN_WIDTH } from './modules';

/**
 * ЧТО МОЖНО СДЕЛАТЬ С ВЫБРАННЫМ МОДУЛЕМ — ОДИН СПИСОК НА ПРОДУКТ.
 *
 * Кнопки панели собирались поштучно и только для нижнего ряда: «+ слева»
 * и «+ справа» добавляли в `run.modules`, «поменять местами» не было
 * вовсе. Движок к этому моменту принимал правку любого ряда, а экран до
 * него не доходил — та самая разница между «feature exists in code» и
 * «feature is ready».
 *
 * Здесь один ответ на вопрос «что с этим модулем можно»: действие,
 * операция под ним и ПРИЧИНА, если нельзя. Причина обязательна — серая
 * кнопка без объяснения это вопрос «почему нельзя», а задавать его при
 * клиенте некому (ловушка 159). Кнопка, которая не сработает, не имеет
 * права выглядеть рабочей.
 *
 * Ряд модуля выводится из СОСЕДЕЙ, а не из типа: сосед слева и сосед
 * справа — это те, кто стоит в том же списке. Так «сдвинуть влево» не
 * может нечаянно утащить верхний модуль в нижний ряд.
 */

export type ModuleActionKey =
  | 'add_left'
  | 'add_right'
  | 'replace'
  | 'remove'
  | 'move_left'
  | 'move_right';

export type ModuleAction = {
  key: ModuleActionKey;
  title: string;
  /** Операции действия. Пусто — действие недоступно, причина в `refusal`. */
  ops: MillworkOp[];
  /** Почему нельзя. Пусто — можно. */
  refusal?: string;
};

/** Ширина нового модуля рядом: минимальная из стандартных. */
const NEW_WIDTH_MM = 300;

/**
 * В КАКОМ РЯДУ СТОИТ МОДУЛЬ.
 *
 * Три списка, и модуль лежит ровно в одном. Спрашивать `kind` нельзя:
 * антресоль и верхний шкаф оба `upper`, а ряды у них разные.
 */
export function rowOfModule(run: Run, unit: Module): Module[] {
  if (run.modules.some((m) => m.id === unit.id)) return run.modules;

  const hanging = run.upperSegments.flatMap((segment) => segment.modules);

  /*
   * КЛАДОВКА НАД КОЛОННОЙ — НЕ ТОТ ЖЕ РЯД, ЧТО ЗАКАЗАННАЯ АНТРЕСОЛЬ.
   *
   * Обе помечены `section: 'mezzanine'`, но опора у них разная
   * (`mezzanineBaseOf`): одна стоит на верхнем ряду и правится, другая
   * на крыше колонны и пересобирается. Сложи их в один список — и
   * «сдвинуть влево» у первой заказанной антресоли предложит соседом
   * кладовку, которой в правимом ряду нет. Замерено: отказ «соседа
   * mezz-0 в ней нет», а добавление уходило в НИЖНИЙ ряд.
   */
  const ordered = hanging.filter(
    (m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run) === null,
  );
  const storage = hanging.filter(
    (m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run) !== null,
  );
  const upper = hanging.filter((m) => m.section !== 'mezzanine');

  if (ordered.some((m) => m.id === unit.id)) return ordered;
  if (storage.some((m) => m.id === unit.id)) return storage;
  return upper;
}

export function moduleActions(run: Run, selectedId: string | null | undefined): ModuleAction[] {
  const unit = moduleById(run, selectedId);
  if (!unit) return [];

  const row = [...rowOfModule(run, unit)].sort((a, b) => a.offsetMm - b.offsetMm);
  const at = row.findIndex((m) => m.id === unit.id);
  const left = at > 0 ? row[at - 1] : null;
  const rightNeighbour = at >= 0 && at < row.length - 1 ? row[at + 1] : null;

  /*
   * ПРИБОР ДЕРЖИТ СВОЁ МЕСТО.
   *
   * Ширину ему задаёт сам прибор, и это уже сказано словами в поле
   * ширины. Переставлять его этими кнопками тоже нельзя: у приборов своя
   * раскладка (рабочий треугольник, вытяжка над варочной), и перенос
   * идёт отдельной правкой состава.
   */
  const appliance = unit.appliance
    ? `У «${unit.label}» место задаёт прибор: его переносят в составе, а не кнопкой.`
    : undefined;

  /** Куда добавлять: слева — «после соседа слева», в начало ряда нельзя. */
  const addLeft: ModuleAction = {
    key: 'add_left',
    title: 'Добавить слева',
    ops: left ? [{ op: 'add_module', kind: unit.kind, widthMm: NEW_WIDTH_MM, afterModuleId: left.id }] : [],
    refusal: left
      ? undefined
      : `«${unit.label}» стоит первым в ряду: слева от него места нет.`,
  };

  const addRight: ModuleAction = {
    key: 'add_right',
    title: 'Добавить справа',
    ops: [{ op: 'add_module', kind: unit.kind, widthMm: NEW_WIDTH_MM, afterModuleId: unit.id }],
  };

  const replace: ModuleAction = {
    key: 'replace',
    title: 'Заменить',
    ops: appliance ? [] : [{ op: 'replace_module', moduleId: unit.id, kind: unit.kind }],
    refusal: appliance,
  };

  const remove: ModuleAction = {
    key: 'remove',
    title: 'Удалить',
    ops: [{ op: 'remove_module', moduleId: unit.id }],
  };

  /*
   * СДВИГ — ЭТО ОБМЕН С СОСЕДОМ, А НЕ ПЕРЕНОС ПО КООРДИНАТЕ.
   *
   * `move_module` с `afterModuleId` ставит модуль на место соседа; ширины
   * едут вместе с модулями. Переноса «по индексу» здесь нет: соседи
   * берутся из ряда по позиции, а не по порядковому номеру в чужом
   * списке.
   */
  const moveLeft: ModuleAction = {
    key: 'move_left',
    title: 'Сдвинуть влево',
    ops: left && !appliance ? [{ op: 'move_module', moduleId: unit.id, afterModuleId: left.id }] : [],
    refusal:
      appliance ?? (left ? undefined : `«${unit.label}» уже первый в ряду.`),
  };

  const moveRight: ModuleAction = {
    key: 'move_right',
    title: 'Сдвинуть вправо',
    ops:
      rightNeighbour && !appliance
        ? [{ op: 'move_module', moduleId: unit.id, afterModuleId: rightNeighbour.id }]
        : [],
    refusal:
      appliance ?? (rightNeighbour ? undefined : `«${unit.label}» уже последний в ряду.`),
  };

  return [addLeft, addRight, replace, remove, moveLeft, moveRight];
}

/** Доступно ли действие: пустой список операций — недоступно. */
export function actionEnabled(action: ModuleAction): boolean {
  return action.ops.length > 0;
}

/** Ширина нового соседа: наружу — чтобы приёмка меряла то же число. */
export const NEW_NEIGHBOUR_WIDTH_MM = NEW_WIDTH_MM;

/** Минимальная ширина модуля: наружу для подписей отказа. */
export const MODULE_MIN_WIDTH_MM = MIN_WIDTH;
