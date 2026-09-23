import { allModules } from './layout';
import { moduleNumbers } from './positions';
import type { Module, Run } from '@/types/millwork';

/**
 * ВЫБРАННЫЙ МОДУЛЬ — ОДНО СОСТОЯНИЕ НА ВЕСЬ ЭКРАН.
 *
 * Модуль выбирают тремя жестами: нажатием в сцене, нажатием на схеме и
 * нажатием в ленте состава. Состояние у всех трёх одно — `selectedId` в
 * рабочем месте; второго выделения в продукте нет и заводить его нельзя:
 * две подсветки на одной мебели читаются как две разные мебели
 * (ловушка 188).
 *
 * Здесь собрано то, что раньше считалось прямо в разметке: какой модуль
 * выбран, под каким он номером и как называется в заголовке панели. Жило
 * это в трёх местах и в двух из них искало модуль не в той стене.
 */

export type SelectionState = {
  /** Модуль, который сейчас правят. Ищется во ВСЕХ рядах. */
  unit: Module | null;
  /**
   * Номер модуля — ТОТ ЖЕ, что стоит в кружке на чертеже.
   *
   * Считает его `moduleNumbers`, и второй нумерации у продукта нет: по
   * этому номеру цех сверяет деталь с листом, и заголовок панели обязан
   * называть то же число.
   */
  number: number | null;
  /** Заголовок панели настроек: «Модуль 3 · 600 мм». */
  title: string | null;
  /** Подпись ленты вариантов: «Дверца 600 мм». */
  caption: string | null;
};

/** Пусто во всех полях: ничего не выбрано либо модуль исчез. */
const NOTHING: SelectionState = { unit: null, number: null, title: null, caption: null };

/**
 * МОДУЛЬ ПО ИДЕНТИФИКАТОРУ — ОДНА ФУНКЦИЯ НА ПРОДУКТ.
 *
 * Ищем ВО ВСЕХ РЯДАХ, а не в нижнем. Верхний модуль и антресоль
 * выделяются на схеме и в сцене наравне с нижним, и панель ширины,
 * материала, открывания и вариантов работает для них. Ищи только в
 * `run.modules` — и выделенный наверху шкаф оставит панель пустой:
 * нажал, подсветилось, а править нечем.
 *
 * Своя копия этого поиска жила в `RunEditor` (`run.modules.find`) и была
 * УЖЕ этой: движок правку антресоли принимал, а поле ширины, «Удалить» и
 * «+» для неё оставались мёртвыми. Второго ответа на вопрос «какой
 * модуль выделен» в продукте быть не должно.
 */
export function moduleById(run: Run, id: string | null | undefined): Module | null {
  if (!id) return null;
  return allModules(run).find((module) => module.id === id) ?? null;
}

export function selectionState(run: Run, selectedId: string | null | undefined): SelectionState {
  if (!selectedId) return NOTHING;

  const unit = moduleById(run, selectedId);
  if (!unit) return NOTHING;

  const number = moduleNumbers(run).get(unit.id) ?? null;

  return {
    unit,
    number,
    /*
     * Номер в заголовке — чтобы замерщик видел, что правит ИМЕННО этот
     * модуль. «Дверца» в ряду встречается несколько раз, номер — ни разу.
     * Нет номера — так и пишем: выдуманный номер хуже его отсутствия.
     */
    title: number ? `Модуль ${number} · ${unit.widthMm} мм` : `Модуль ${unit.widthMm} мм`,
    caption: `${unit.label} ${unit.widthMm} мм`,
  };
}

/**
 * КАКОЙ МОДУЛЬ НАЖАЛИ В СЦЕНЕ.
 *
 * Сцена рисует ДЕТАЛИ, и нажатие приходит с идентификатором детали —
 * `<модуль>:door:0`. Выделение при этом общее со схемой, значит модуль
 * из детали достаётся по одному правилу на продукт.
 *
 * Разделитель здесь тот же, что закладывает `moduleId`: в самом
 * идентификаторе модуля двоеточия нет (стена отделяется `@`), и второе
 * двоеточие сломало бы выделение — об этом сказано там же, в `layout.ts`.
 */
export function moduleOfPart(partId: string): string | null {
  const id = partId.split(':')[0];
  return id ? id : null;
}

/** Какому ряду принадлежит модуль. */
export type RunRow = 'base' | 'upper' | 'mezzanine';

/**
 * В КАКОМ РЯДУ СТОИТ МОДУЛЬ.
 *
 * Правка живёт внутри одного ряда: наполнение пишется в тот ряд, где его
 * правили, а перенос переставляет модуль среди СОСЕДЕЙ ПО РЯДУ. Ответ
 * на «в каком ряду» должен быть один — жест на чертеже и операция в
 * движке обязаны выбрать один и тот же список, иначе подсветка покажет
 * одно, а запись уйдёт в другое.
 *
 * Ряд определяется тем, где модуль ЛЕЖИТ, а не его видом: у полосы
 * антресоли в шкафу-купе вид `upper` — тот же, что у верхнего ряда
 * кухни, — и различает их только `section`.
 */
export function rowOfModule(
  run: Run,
  id: string | null | undefined,
): { row: RunRow; modules: Module[] } | null {
  if (!id) return null;

  if (run.modules.some((unit) => unit.id === id)) {
    return { row: 'base', modules: run.modules };
  }

  const upper = run.upperSegments.flatMap((segment) => segment.modules);
  const found = upper.find((unit) => unit.id === id);
  if (!found) return null;

  const row: RunRow = found.section === 'mezzanine' ? 'mezzanine' : 'upper';
  return { row, modules: upper.filter((unit) => (unit.section === 'mezzanine') === (row === 'mezzanine')) };
}

/**
 * КУДА ВСТАНЕТ МОДУЛЬ, ЕСЛИ ОТПУСТИТЬ ЕГО ЗДЕСЬ.
 *
 * Перетаскивание даёт одно число — левый край под пальцем. Что из него
 * следует, зависит от режима, и ответ здесь ОДИН на подсветку и на
 * операцию: подсветка обязана показывать то место, которое запишется.
 *
 * `offsetMm` — свободная сборка: модуль встаёт туда, где отпустили, а
 * соседи не двигаются. Здесь эта функция ничего не решает.
 *
 * `afterModuleId` — раскладка по шаблону и верхние ряды: там позиция
 * выводится из суммы ширин, и «поставить на 1750 мм» не значит ничего —
 * ряд всё равно сойдётся со стеной. Жест означает ПЕРЕСТАНОВКУ, и
 * считается она по центру: модуль встаёт перед тем соседом, чью
 * середину он перешёл.
 */
export function reorderTarget(
  modules: Module[],
  moduleId: string,
  offsetMm: number,
): { afterModuleId: string; offsetMm: number } | null {
  const from = modules.findIndex((unit) => unit.id === moduleId);
  if (from < 0) return null;

  const centre = offsetMm + modules[from].widthMm / 2;

  /* Порядок без переносимого модуля: между кем он встаёт. */
  const rest = modules.filter((_, i) => i !== from);
  let to = rest.length;
  let at = modules[0]?.offsetMm ?? 0;
  for (let i = 0; i < rest.length; i += 1) {
    if (centre < at + rest[i].widthMm / 2) {
      to = i;
      break;
    }
    at += rest[i].widthMm;
  }

  if (to === from) return null;

  /*
   * `afterModuleId` в `move_module` — это СОСЕД, НА ЧЬЁ МЕСТО встают:
   * модуль вынимается из списка и вставляется по индексу соседа. Значит
   * называть надо того, кто окажется на этом индексе.
   */
  const neighbour = modules[Math.min(to, modules.length - 1)];
  if (!neighbour || neighbour.id === moduleId) return null;

  /* Отметка после перестановки — сумма ширин тех, кто окажется левее. */
  const order = [...rest];
  order.splice(to, 0, modules[from]);
  const start = modules[0]?.offsetMm ?? 0;
  const landed = order
    .slice(0, order.findIndex((unit) => unit.id === moduleId))
    .reduce((sum, unit) => sum + unit.widthMm, start);

  return { afterModuleId: neighbour.id, offsetMm: landed };
}

/**
 * В КАКОЙ СТЕНЕ СТОИТ ЭТОТ МОДУЛЬ.
 *
 * Схема показывает все ряды композиции рядом, и нажать можно в любом.
 * Правки при этом уходят в АКТИВНУЮ стену: `applyOps` правит один ряд, и
 * операция по модулю чужой стены в нём просто не найдётся. Поэтому выбор
 * модуля и выбор стены — один жест, а не два: нажали на стене Б — она и
 * стала активной.
 *
 * Возвращается номер ряда в композиции — тот же индекс, которым
 * подписаны стены (`wallLabel`) и по которому рабочее место пишет
 * правку. `null` — модуля нет ни в одном ряду.
 */
export function wallOfModule(runs: Run[], moduleId: string | null | undefined): number | null {
  if (!moduleId) return null;
  const at = runs.findIndex((run) => allModules(run).some((module) => module.id === moduleId));
  return at < 0 ? null : at;
}

/**
 * ВЫДЕЛЕНИЕ ПОСЛЕ ПЕРЕСБОРКИ РЯДА.
 *
 * Правка пересобирает ряд: идентификатор модуля выводится из позиции, и
 * сдвинутый сосед получает другой id. Выбор при этом решается ФАКТОМ, а
 * не списком операций: модуль на месте — выделение остаётся, модуль
 * исчез — снимается.
 *
 * Список «какие операции сохраняют выделение» жил в рабочем месте и
 * отвечал на этот вопрос догадкой: потянул ширину — модуль никуда не
 * делся, а панель под ним закрывалась, и дальше нажимать было не на что.
 */
export function keepSelection(next: Run, selectedId: string | null | undefined): string | null {
  if (!selectedId) return null;
  return allModules(next).some((module) => module.id === selectedId) ? selectedId : null;
}
