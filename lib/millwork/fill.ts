import {
  APPLIANCE_COLUMN,
  GEOMETRY,
  standardHeightMm,
  nicheHeightMm,
  standsOnFloor,
} from './modules';
import { MODULE_VARIANTS, currentVariant } from './moduleVariants';
import { defaultOpening } from './opening';
import { sectionSpec } from './sections';
import { upperRowBottomMm, zoneHeightMm, zoneProfile } from './zones';
import type { ApplianceKind, Module, ModuleFill, Run, ZoneKind } from '@/types/millwork';

/**
 * ЧТО ВНУТРИ МОДУЛЯ.
 *
 * Пустой прямоугольник с шириной — это визуализатор. Мебельная компания
 * начинает разговор с наполнения: сколько полок, где штанга, какие ящики.
 * Отсюда же считается детализировка, а её сегодня технолог пишет руками
 * час на каждый заказ.
 */

/* ─────────────────────────  Система 32  ───────────────────────── */

/**
 * Отраслевой стандарт: присадочные отверстия идут шагом 32 мм, и полка
 * садится ТОЛЬКО на них. Полки на «высоте 412 мм» не существует — есть
 * та, что попала на отверстие. Мебельщик замечает это первым: если полка
 * встаёт куда угодно, инструмент писал человек не из отрасли.
 */
export const SYSTEM32_STEP_MM = 32;

/** Первое отверстие от дна корпуса. */
export const SYSTEM32_BASE_MM = 32;

/** Ближайшее допустимое положение полки. */
export function snapTo32(mm: number): number {
  const steps = Math.round((mm - SYSTEM32_BASE_MM) / SYSTEM32_STEP_MM);
  return SYSTEM32_BASE_MM + Math.max(0, steps) * SYSTEM32_STEP_MM;
}

/**
 * Ближайшее отверстие НЕ НИЖЕ заданной высоты.
 *
 * Ниша под прибор не может стать меньше паспортной: духовка в 590 мм не
 * влезет. Поэтому опора ниши округляется вверх, а не к ближайшему —
 * лишние миллиметры прибору не мешают, недостающие означают возврат.
 */
export function snapUp32(mm: number): number {
  const steps = Math.ceil((mm - SYSTEM32_BASE_MM) / SYSTEM32_STEP_MM);
  return SYSTEM32_BASE_MM + Math.max(0, steps) * SYSTEM32_STEP_MM;
}

/**
 * Ниши колонны снизу вверх: высота от дна корпуса и её прибор.
 *
 * Одна функция на чертёж, 3D и наполнение: посчитай её дважды — и клиент
 * увидит духовку на одной высоте, а цех присадит на другой. Полки-опоры
 * садятся на систему 32, как любые другие: ниша от этого только выше
 * паспортной, а не ниже.
 */
export function columnNiches(
  unit: Pick<Module, 'column' | 'applianceSizes'>,
  carcassHeightMm: number,
): { appliance: ApplianceKind; fromMm: number; toMm: number }[] {
  const column = unit.column;
  if (!column) return [];

  /*
   * Высота ниши — от размера ЭТОГО прибора, КАЖДОГО своего. Паспортные
   * 595 у духовки это стандарт, а не закон, и прибор клиента может быть
   * другим; но главное — приборов в колонне два, и высота у них разная.
   * Один размер на модуль давал микроволновке духовочную нишу, и в
   * пенале появлялось двадцать сантиметров пустоты.
   */
  const sizes = unit.applianceSizes;
  const bottomH = nicheHeightMm(column.bottom as ApplianceKind, sizes?.[column.bottom as ApplianceKind]);
  const topH = nicheHeightMm(column.top as ApplianceKind, sizes?.[column.top as ApplianceKind]);

  // Низкий пенал: приборы садятся от дна, иначе верхний упрётся в крышу.
  const needed = bottomH + topH + APPLIANCE_COLUMN.shelfMm;
  const base = snapUp32(
    Math.max(0, Math.min(APPLIANCE_COLUMN.baseMm, carcassHeightMm - needed)),
  );

  const boundary = snapUp32(base + bottomH);

  return [
    { appliance: column.bottom as ApplianceKind, fromMm: base, toMm: boundary },
    { appliance: column.top as ApplianceKind, fromMm: boundary, toMm: snapUp32(boundary + topH) },
  ];
}

/** Полки ближе трёх шагов друг к другу бессмысленны: туда ничего не встанет. */
export const MIN_SHELF_GAP_MM = SYSTEM32_STEP_MM * 3;

/** Ящик ниже 100 мм не нужен, выше 400 мм не выдвигается нормально. */
export const MIN_DRAWER_MM = 100;
export const MAX_DRAWER_MM = 400;

/** Перегородка не ближе этого к боковине: уже — не отсек, а щель. */
export const MIN_DIVIDER_EDGE_MM = 150;

/* ─────────────────────────  Габарит модуля  ───────────────────────── */

/**
 * Высота КОРПУСА модуля: от дна до крыши, без цоколя и столешницы.
 * По ней считается и наполнение, и детализировка.
 */
export function moduleCarcassHeightMm(
  unit: Module,
  run: Pick<Run, 'zone' | 'ceilingHeightMm' | 'options'> &
    Partial<Pick<Run, 'upperSegments' | 'mezzanine'>>,
): number {
  const zone = zoneProfile(run.zone);
  const top = zoneHeightMm(run.zone, run.ceilingHeightMm);

  /*
   * Шкаф до потолка ДЕЛИТ высоту с антресолью, а не занимает её всю.
   * Пока корпус доходил до потолка сам, антресоли было некуда встать —
   * и она садилась внутрь него.
   */
  const bodyTop = hasMezzanine(run) ? mezzanineBottomMm(run) : top;
  const fullBody = Math.max(GEOMETRY.base.carcassH, bodyTop - GEOMETRY.base.plinthH);

  if (unit.section) {
    const spec = sectionSpec(unit.section);

    /*
     * Секции шкафа стоят во всю высоту ряда и различаются НАЧИНКОЙ, а не
     * габаритом: полутораметровый отсек под пальто рядом с двухметровым
     * отсеком под полки — это не шкаф, а стеллаж. Число в спецификации
     * секции задаёт чистую высоту под штангой, а не высоту корпуса.
     */
    if (spec.moduleKind === 'tall') return fullBody;

    /*
     * Антресоль — её собственная высота, а не кухонные 720. И не всегда
     * отраслевые 500: её продают отдельной позицией, и высоту заказчик
     * выбирает под свой потолок.
     */
    if (unit.section === 'mezzanine') return mezzanineHeightMm(run);
    if (spec.heightMm > 0) return spec.heightMm;
    return fullBody;
  }

  if (zone.kind !== 'kitchen') return fullBody;

  const standard = standardHeightMm(unit.kind, {
    upperToCeiling: run.options.upperToCeiling,
    ceilingHeightMm: run.ceilingHeightMm,
  });

  /*
   * ВЕРХНИЙ РЯД УСТУПАЕТ МЕСТО АНТРЕСОЛИ.
   *
   * Кухонная ветка считала высоту одной формулой и про антресоль не
   * знала вовсе: поставленная сверху, антресоль занимала ТОТ ЖЕ объём,
   * что шкафы под ней, — инвариант непересечения ловил это исключением.
   * Антресоль садится НА шкаф, значит шкаф кончается там, где она
   * начинается. Отметка одна на весь продукт — `mezzanineBottomMm`.
   */
  const upperRow = unit.kind === 'upper' || unit.kind === 'corner_upper';
  if (upperRow && hasMezzanine(run)) {
    const room = mezzanineBottomMm(run) - GEOMETRY.upper.bottomFromFloor;
    return Math.max(0, Math.min(standard, room));
  }

  return standard;
}

/** В ряду есть антресоль: она забирает верх, и корпус под неё укорачивается. */
export function hasMezzanine(
  run: Partial<Pick<Run, 'upperSegments' | 'mezzanine'>>,
): boolean {
  if (run.mezzanine) return true;
  return (run.upperSegments ?? []).some((segment) =>
    segment.modules.some((unit) => unit.section === 'mezzanine'),
  );
}

/**
 * Высота антресоли этого ряда: своя, если задана, иначе отраслевая.
 *
 * Одна функция на весь продукт: высоту спрашивают наполнение, раскрой,
 * чертёж и инвариант непересечения. Второе число развело бы антресоль
 * с тем местом, которое под неё оставил верхний ряд.
 */
export function mezzanineHeightMm(run: Partial<Pick<Run, 'mezzanine'>>): number {
  const own = run.mezzanine?.heightMm;
  return own && own > 0 ? Math.round(own) : sectionSpec('mezzanine').heightMm;
}

/** Низ антресоли: потолок зоны минус её собственная высота. */
export function mezzanineBottomMm(
  run: Pick<Run, 'zone' | 'ceilingHeightMm'> & Partial<Pick<Run, 'mezzanine'>>,
): number {
  return upperRowBottomMm(run.zone, run.ceilingHeightMm, mezzanineHeightMm(run));
}

/**
 * ОТМЕТКА НИЗА ВЕРХНЕГО РЯДА ДЛЯ ЭТОГО РЯДА.
 *
 * Одна функция на сцену, аксонометрию, чертёж, смету и инвариант. Высота
 * верхнего модуля берётся у него самого — у антресоли она своя.
 */
export function upperBottomFor(
  unit: Module,
  run: Pick<Run, 'zone' | 'ceilingHeightMm' | 'options' | 'upperSegments'>,
): number {
  return upperRowBottomMm(run.zone, run.ceilingHeightMm, moduleCarcassHeightMm(unit, run));
}

/** Глубина корпуса модуля в этой зоне. */
/**
 * НЕСЁТ ЛИ МОДУЛЬ СТОЛЕШНИЦУ.
 *
 * Вопрос физический, и ответ на него — высота, а не вид модуля. Раньше
 * из метража столешницы вычитали верхний ряд по `kind`, а пенал в нём не
 * значился: столешница «ложилась» поверх колонны холодильника, и клиент
 * платил за 1.2 погонных метра камня, которых не будет. Фартук за той же
 * колонной считался так же.
 *
 * Модуль несёт столешницу, если стоит на полу и кончается НИЖЕ верхнего
 * ряда: на то, что выше, положить её нельзя.
 */
export function bearsCountertop(
  unit: Module,
  run: Parameters<typeof moduleCarcassHeightMm>[1],
): boolean {
  if (!standsOnFloor(unit)) return false;
  return (
    GEOMETRY.base.plinthH + moduleCarcassHeightMm(unit, run) < GEOMETRY.upper.bottomFromFloor
  );
}

export function moduleDepthMm(unit: Module, zone: ZoneKind | undefined): number {
  const profile = zoneProfile(zone);
  const standard =
    profile.kind !== 'kitchen'
      ? profile.depthMm
      : unit.kind === 'upper' || unit.kind === 'corner_upper'
        ? GEOMETRY.upper.depth
        : GEOMETRY.base.depth;

  /*
   * ГЛУБОКИЙ ПРИБОР ОТОДВИГАЕТ КОРПУС.
   *
   * Стандартная глубина — это то, с чего начинается разговор, а не
   * закон: холодильник 640 мм в корпус 560 не встанет. Раньше введённая
   * глубина лежала в данных и не делала ничего — модуль оставался
   * прежним, а прибор на чертеже выпирал бы за фасад.
   *
   * Зазор сзади наш: прибору нужен просвет на вентиляцию и подводку.
   */
  const deepest = Math.max(
    0,
    ...Object.values(unit.applianceSizes ?? {}).map((size) => size?.depthMm ?? 0),
  );

  return deepest > 0 ? Math.max(standard, deepest + APPLIANCE_BACK_GAP_MM) : standard;
}

/** Просвет за прибором: вентиляция и подводка. Из интерфейса не меняется. */
export const APPLIANCE_BACK_GAP_MM = 20;

/**
 * Глубже этого прибор в корпусный ряд не встраивают.
 *
 * Столешница глубиной 600 мм со свесом закрывает корпус до 700; всё, что
 * глубже, выпирает в проход, и об этот выступ бьются коленом.
 */
export const MAX_APPLIANCE_DEPTH_MM = 700;

/* ─────────────────────────  Наполнение по умолчанию  ───────────────────────── */

/** Полки равномерно по высоте, все на системе 32. */
function evenShelves(heightMm: number, count: number): number[] {
  const shelves: number[] = [];
  for (let i = 1; i <= count; i++) {
    const raw = (heightMm * i) / (count + 1);
    const snapped = snapTo32(raw);
    if (snapped > 0 && snapped < heightMm) shelves.push(snapped);
  }
  return dedupe(shelves);
}

/** Полки фиксированным шагом снизу вверх. */
function steppedShelves(heightMm: number, stepMm: number): number[] {
  const shelves: number[] = [];
  for (let at = stepMm; at < heightMm - MIN_SHELF_GAP_MM; at += stepMm) {
    shelves.push(snapTo32(at));
  }
  return dedupe(shelves);
}

function dedupe(values: number[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (out.length === 0 || value - out[out.length - 1] >= MIN_SHELF_GAP_MM) out.push(value);
  }
  return out;
}

/**
 * Высоты фронтов ящиков сверху вниз.
 *
 * Стандартный набор нижнего модуля: узкий верхний под мелочи и три равных
 * ниже. Сумма ОБЯЗАНА совпасть с высотой модуля до миллиметра — иначе
 * фасады не закроют корпус.
 */
function drawerHeights(heightMm: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [heightMm];

  const top = Math.min(MAX_DRAWER_MM, Math.max(MIN_DRAWER_MM, 140));
  const rest = heightMm - top;
  const each = Math.floor(rest / (count - 1));
  const heights = [top, ...Array.from({ length: count - 1 }, () => each)];

  // Остаток от деления кладём в нижний фронт: он самый большой.
  const sum = heights.reduce((s, h) => s + h, 0);
  heights[heights.length - 1] += heightMm - sum;
  return heights;
}

/**
 * Наполнение по умолчанию — из типа модуля и секции, детерминированно.
 *
 * Замерщик может поменять его перетаскиванием, но открываться модуль должен
 * с тем, что в этой мебели стоит обычно: пустой шкаф на встрече выглядит
 * так же плохо, как пустой конструктор.
 */
export function defaultFill(
  unit: Module,
  run: Pick<Run, 'zone' | 'ceilingHeightMm' | 'options'>,
  /** Индекс модуля в ряду: от него зависит сторона открывания. */
  index = 0,
  total = 1,
): ModuleFill {
  const heightMm = moduleCarcassHeightMm(unit, run);
  const empty: ModuleFill = {
    shelves: [],
    dividerMm: 0,
    rodsMm: [],
    drawerHeights: [],
    hinge: 'none',
  };

  /*
   * Колонна: полки-опоры ниш. Это настоящие детали — на них стоит духовка,
   * и в детализировке они обязаны быть. Ниже нижней ниши остаётся отсек
   * под противни, выше верхней — полка, если место есть.
   */
  if (unit.column) {
    const niches = columnNiches(unit, heightMm);
    const shelves = [
      niches[0].fromMm,
      niches[1].fromMm,
      snapUp32(niches[1].toMm),
    ].filter((mm) => mm > 0 && mm < heightMm - MIN_SHELF_GAP_MM);

    return { ...empty, shelves: dedupe(shelves) };
  }

  /*
   * ПОД ВАРОЧНОЙ — ЯЩИКИ, И ОНИ НАСТОЯЩИЕ.
   *
   * У техники «внутри прибор», но фасад под ней — обычные ящики: чертёж
   * рисовал два фронта, промпт называл два, а в раскрое лежала ОДНА
   * глухая панель на всю высоту. Цех получил бы её и собрал не ту мебель.
   *
   * Число фронтов задаёт вариант места (`hob_base` — два), тот же, что
   * читает `frontGlyph`. Высоты раскладываются здесь, и дальше их видят
   * все: раскрой, чертёж, промпт и 3D.
   */
  if (unit.appliance && !unit.column) {
    const spec = MODULE_VARIANTS[currentVariant(unit)];
    const count = spec?.frontType === 'drawers' ? (spec.drawerCount ?? 0) : 0;
    if (count > 0) return { ...empty, drawerHeights: drawerHeights(heightMm, count) };
  }

  // У прочей техники и доборной планки наполнения нет: внутри прибор.
  if (unit.appliance || unit.kind === 'filler') return empty;

  /*
   * Направление — из `defaultOpening`, включая подъёмник: вариант места
   * «Подъёмник» и есть выбор направления, и решает это одна функция.
   */
  const hinge = hingeSide(unit, index, total);

  if (unit.section) {
    switch (unit.section) {
      case 'hanging_long':
        // Штанга на 1500 и одна полка над ней — антресольная зона секции.
        return {
          ...empty,
          rodsMm: [Math.min(1500, heightMm - 100)],
          shelves: heightMm > 1700 ? [snapTo32(1600)] : [],
          hinge,
        };

      case 'hanging_double':
        return {
          ...empty,
          rodsMm: [Math.min(1900, heightMm - 100), 950].filter((v) => v > 0),
          hinge,
        };

      case 'shelves':
        return { ...empty, shelves: steppedShelves(heightMm, 350), hinge };

      case 'drawers':
        return { ...empty, drawerHeights: drawerHeights(heightMm, unit.drawerCount || 4) };

      case 'open':
        return { ...empty, shelves: steppedShelves(heightMm, 350) };

      case 'mezzanine':
        return { ...empty, shelves: evenShelves(heightMm, 1), hinge };

      case 'hooks':
        // Открытая вешалка: одна верхняя полка под шапки, крючки на задней стенке.
        return { ...empty, shelves: [snapTo32(heightMm - 300)] };

      case 'shoes':
        // Три наклонных яруса — это три «полки» под наклоном.
        return { ...empty, shelves: evenShelves(heightMm, 3), hinge };

      case 'bench':
        return { ...empty };

      case 'mirror':
        return { ...empty };

      case 'tv_niche':
        return { ...empty };

      case 'glass_display':
        // Стеклянные полки шагом 350 мм: посуда и стекло, а не коробки.
        return { ...empty, shelves: steppedShelves(heightMm, 350) };

      case 'hanging_module':
        return { ...empty, shelves: evenShelves(heightMm, 1), hinge };

      case 'vanity':
        // Под раковиной сифон: полок нет вовсе.
        return { ...empty, hinge };

      case 'tall_unit':
        return { ...empty, shelves: steppedShelves(heightMm, 350), hinge };

      case 'mirror_cabinet':
        return { ...empty, shelves: evenShelves(heightMm, 1), hinge };

      default:
        return { ...empty, hinge };
    }
  }

  // Кухня: наполнение от типа модуля.
  if (unit.frontType === 'drawers') {
    return { ...empty, drawerHeights: drawerHeights(heightMm, unit.drawerCount || 4) };
  }

  if (unit.kind === 'tall') return { ...empty, shelves: evenShelves(heightMm, 4), hinge };
  if (unit.kind === 'upper' || unit.kind === 'corner_upper') {
    return { ...empty, shelves: evenShelves(heightMm, 2), hinge };
  }

  return { ...empty, shelves: evenShelves(heightMm, 1), hinge };
}

/**
 * Направление открывания по умолчанию.
 *
 * Считает его `defaultOpening` — одна функция на продукт. Здесь остаётся
 * только вызов: сторона петель, подъёмник и откидной живут в одном поле,
 * и выводить их двумя формулами значило бы завести ту же беду заново.
 *
 * Раньше у двустворчатого модуля здесь стояло `'none'` — и одно значение
 * означало сразу две разные вещи: «фасада нет вовсе» и «сторон две».
 * Теперь это `'double'`, и данные говорят сами за себя.
 */
export function hingeSide(unit: Module, index: number, total: number): ModuleFill['hinge'] {
  return defaultOpening(unit, index, total);
}

/* ─────────────────────────  Правки наполнения  ───────────────────────── */

/** Полка садится на систему 32 и не ближе трёх шагов к соседней. */
/**
 * Результат правки полки.
 *
 * ОТКАЗ НАЗЫВАЕТ ПРИЧИНУ. Раньше `clampShelf` возвращал `null`, а обёртки
 * молча отдавали ТОТ ЖЕ `fill`: замерщик тянул полку, отпускал, и не
 * происходило ничего — ни движения, ни объяснения. Инструмент, который
 * молча не слушается, читается как сломанный.
 */
export type ShelfEdit = {
  /** Принято — новое наполнение; отклонено — прежнее, без изменений. */
  fill: ModuleFill;
  /** Пусто, если правка принята. Иначе — последствие, а не факт. */
  rejected?: string;
};

export function moveShelf(
  fill: ModuleFill,
  indexAt: number,
  toMm: number,
  heightMm: number,
): ShelfEdit {
  const others = fill.shelves.filter((_, i) => i !== indexAt);
  const spot = clampShelf(snapTo32(toMm), others, heightMm);
  if ('reason' in spot) return { fill, rejected: spot.reason };
  return { fill: { ...fill, shelves: [...others, spot.mm].sort((a, b) => a - b) } };
}

export function addShelf(fill: ModuleFill, atMm: number, heightMm: number): ShelfEdit {
  const spot = clampShelf(snapTo32(atMm), fill.shelves, heightMm);
  if ('reason' in spot) return { fill, rejected: spot.reason };
  return { fill: { ...fill, shelves: [...fill.shelves, spot.mm].sort((a, b) => a - b) } };
}

/** Снять полку можно всегда: отказывать тут не в чем. */
export function removeShelf(fill: ModuleFill, indexAt: number): ModuleFill {
  return { ...fill, shelves: fill.shelves.filter((_, i) => i !== indexAt) };
}

/**
 * Допустимо ли ставить полку сюда.
 *
 * Формулировки называют ПОСЛЕДСТВИЕ: «нечего будет поставить» вместо
 * «нарушен минимальный зазор». Замерщик читает это при клиенте, и слово
 * «зазор» здесь означает только то, что он что-то сделал не так.
 */
function clampShelf(
  mm: number,
  others: number[],
  heightMm: number,
): { mm: number } | { reason: string } {
  if (mm < MIN_SHELF_GAP_MM) {
    return {
      reason: `Ниже ${MIN_SHELF_GAP_MM} мм от дна полка не встанет — под неё ничего не положить.`,
    };
  }

  if (mm > heightMm - MIN_SHELF_GAP_MM) {
    return {
      reason:
        `Выше ${heightMm - MIN_SHELF_GAP_MM} мм полку не закрепить: ` +
        `корпус кончается на ${heightMm} мм.`,
    };
  }

  const near = others.find((other) => Math.abs(other - mm) < MIN_SHELF_GAP_MM);
  if (near !== undefined) {
    return {
      reason:
        `Слишком близко к полке на ${near} мм: между ними останется ` +
        `меньше ${MIN_SHELF_GAP_MM} мм, туда ничего не поставить.`,
    };
  }

  return { mm };
}

/** Перегородка ходит шагом 32 мм и не подходит к боковине ближе 150 мм. */
export function moveDivider(fill: ModuleFill, toMm: number, widthMm: number): ModuleFill {
  const inner = Math.max(0, widthMm);
  const snapped = SYSTEM32_STEP_MM * Math.round(toMm / SYSTEM32_STEP_MM);
  const min = MIN_DIVIDER_EDGE_MM;
  const max = inner - MIN_DIVIDER_EDGE_MM;
  if (max <= min) return { ...fill, dividerMm: 0 };
  return { ...fill, dividerMm: Math.min(max, Math.max(min, snapped)) };
}

/**
 * Граница между ящиками: тянем её, а сумма высот остаётся равной высоте
 * модуля. Иначе фасады не закроют корпус, и цех сделает мебель с щелью.
 */
export function moveDrawerBoundary(
  fill: ModuleFill,
  boundaryIndex: number,
  deltaMm: number,
): ModuleFill {
  const heights = [...fill.drawerHeights];
  const a = boundaryIndex;
  const b = boundaryIndex + 1;
  if (a < 0 || b >= heights.length) return fill;

  const shift = Math.round(deltaMm);
  const nextA = heights[a] + shift;
  const nextB = heights[b] - shift;

  if (nextA < MIN_DRAWER_MM || nextA > MAX_DRAWER_MM) return fill;
  if (nextB < MIN_DRAWER_MM || nextB > MAX_DRAWER_MM) return fill;

  heights[a] = nextA;
  heights[b] = nextB;
  return { ...fill, drawerHeights: heights };
}

/**
 * Клик по диагонали меняет сторону петель.
 *
 * Меняет РОВНО сторону: подъёмник и откидной переключаются выбором
 * направления, а не этим жестом — иначе нажатие на дугу молча превратило
 * бы механизм за десять тысяч в обычную петлю.
 *
 * И это ВЫБОР человека: дальше пересчёт стороны по месту в ряду его не
 * трогает.
 */
export function flipHinge(fill: ModuleFill): ModuleFill {
  if (fill.hinge !== 'left' && fill.hinge !== 'right') return fill;
  return {
    ...fill,
    hinge: fill.hinge === 'left' ? 'right' : 'left',
    openingChosen: true,
  };
}

/** Наполнение ряда: считается один раз и живёт вместе с модулями. */
export function fillRun(run: Run): Run {
  const modules = run.modules.map((unit, i) => ({
    ...unit,
    fill: unit.fill ?? defaultFill(unit, run, i, run.modules.length),
  }));

  const upperSegments = run.upperSegments.map((segment) => ({
    ...segment,
    modules: segment.modules.map((unit, i) => ({
      ...unit,
      fill: unit.fill ?? defaultFill(unit, run, i, segment.modules.length),
    })),
  }));

  return { ...run, modules, upperSegments };
}
