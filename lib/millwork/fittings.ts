import { DEFAULT_ALLOWANCES, type HardwareCategory, type HardwareItem, type ProductionSettings } from '@/types/catalog';
import type { FittingSlot, Module, ModuleFitting, Run } from '@/types/millwork';
import { moduleCarcassHeightMm, moduleDepthMm } from './fill';
import { HANDLE_TITLE, frontDrawerSlides, handleOf, isPullOut, openingHardware, openingOf } from './opening';
import { moduleFronts } from './applianceFront';
import { cornerOfModule } from './corner';
import { bayEnvelope, bayLayout } from './bays';
import { shopOf } from './shop';
import { isUpperRow, standsOnFloor } from './modules';
import { drawerBoxRulesOf, drawerProfileFor, runnerGeometry } from './drawerBox';
import { slidingDoorCount } from './sections';
import { handleItemModel } from './handleModel';
import { handleSpotOf } from './handlePlace';
import { isMechanism, mechanismOf, TYPE_TITLE } from './mechanisms';

/**
 * ФУРНИТУРА ПРОИЗВОДИТЕЛЯ НА МЕСТЕ МОДУЛЯ (HARDWARE-01).
 *
 * Модуль хранит только ССЫЛКУ: место (`slot`) и позицию каталога
 * организации (`Module.fittings`). Всё остальное выводится:
 *
 *   какие места у модуля есть      — из того, что на нём висит и стоит
 *                                    (`openingHardware`, `moduleFronts`,
 *                                    `bayLayout`) — тех же функций, что
 *                                    считают смету и рисуют сцену;
 *   сколько изделий на месте        — оттуда же: петель — по полотнам,
 *                                    направляющих — по ящикам;
 *   встаёт ли позиция               — `fittingVerdict` по паспорту позиции
 *                                    и по геометрии модуля.
 *
 * Совместимость не угадывается. Проверка с числом паспорта — «да» или
 * «нет» с миллиметрами; числа в паспорте нет — «не проверено» и названо,
 * чего нет. Позиция с отказом не ставится; позиция «не проверено»
 * ставится, и её статус виден везде, где она есть.
 */

export const FITTING_SLOT_TITLE: Record<FittingSlot, string> = {
  hinge: 'Петли',
  hinge_plate: 'Ответные планки петель',
  slide: 'Направляющие ящиков',
  lift: 'Подъёмный механизм',
  handle: 'Ручки',
  pantograph: 'Пантограф',
  wardrobe_pullout: 'Выдвижное гардеробное',
  cargo: 'Карго и выдвижные корзины',
  dryer: 'Посудосушитель',
  corner_unit: 'Угловой механизм',
  waste: 'Система для мусора',
  shelf_support: 'Полкодержатели',
  leg: 'Опоры',
};

/** Подвиды гардеробного наполнения, которые выдвигаются из отсека. */
const PULLOUT_KINDS = new Set(['pullout_rod', 'trouser_rack', 'shoe_rack', 'tie_rack', 'inner_drawer', 'basket', 'organizer']);
const CARGO_KINDS = new Set(['cargo', 'bottle', 'tall_cargo']);
const CARGO_WORD: Record<string, string> = { cargo: 'карго', bottle: 'бутылочница', tall_cargo: 'высокое карго' };

/**
 * ВСТАЁТ ЛИ ПОЗИЦИЯ НА ЭТО МЕСТО ПО СВОЕМУ ВИДУ.
 *
 * Категория — группа каталога (A–I), подвид — что именно: планка петли
 * не петля, пантограф не брючница. Одна функция на список каталога в
 * Studio и на проверку операции.
 */
export function slotAccepts(slot: FittingSlot, item: Pick<HardwareItem, 'hardware'>): boolean {
  const { category, subcategory } = item.hardware;
  switch (slot) {
    case 'hinge':
      /* Ограничитель, заглушка, доводчик-насадка — принадлежности петли, а не петля. */
      return category === 'hinge' && subcategory !== 'mounting_plate' && subcategory !== 'hinge_accessory';
    case 'hinge_plate':
      return category === 'hinge' && subcategory === 'mounting_plate';
    case 'slide':
      /* Стабилизатор, упор глубины, фиксатор — принадлежности направляющей: место направляющей они не занимают. */
      return category === 'slide' && subcategory !== 'runner_accessory';
    case 'lift':
      /* Рычаги, крепления фасада, заглушки — принадлежности механизма, место механизма они не занимают. */
      return category === 'lift' && subcategory !== 'lift_accessory';
    case 'handle':
      /* Уголок и заглушка профиля — принадлежности, а не ручка: место ручки они не занимают. */
      return category === 'handle' && subcategory !== 'profile_accessory' && subcategory !== 'profile_end_cap';
    case 'pantograph':
      return category === 'wardrobe' && subcategory === 'pantograph';
    case 'wardrobe_pullout':
      return category === 'wardrobe' && PULLOUT_KINDS.has(subcategory ?? '');
    case 'cargo':
      return category === 'kitchen' && CARGO_KINDS.has(subcategory ?? '');
    case 'dryer':
      return category === 'kitchen' && subcategory === 'dish_dryer';
    case 'corner_unit':
      return category === 'kitchen' && subcategory === 'corner_unit';
    case 'waste':
      return category === 'kitchen' && subcategory === 'waste';
    case 'shelf_support':
      return category === 'carcass' && subcategory === 'shelf_support';
    case 'leg':
      return category === 'carcass' && subcategory === 'leg';
  }
}

/** Категории, из которых каталог Studio предлагает позиции для места. */
export const SLOT_CATEGORIES: Record<FittingSlot, HardwareCategory[]> = {
  hinge: ['hinge'],
  hinge_plate: ['hinge'],
  slide: ['slide'],
  lift: ['lift'],
  handle: ['handle'],
  pantograph: ['wardrobe'],
  wardrobe_pullout: ['wardrobe'],
  cargo: ['kitchen'],
  dryer: ['kitchen'],
  corner_unit: ['kitchen'],
  waste: ['kitchen'],
  shelf_support: ['carcass'],
  leg: ['carcass'],
};

/* ─────────────────────────  Что установлено  ───────────────────────── */

/**
 * ПОЗИЦИЯ НА МЕСТЕ МОДУЛЯ — одна функция на смету, раскрой, сцену и экран.
 *
 * Прежняя ссылка модуля (`hardwareItemId`, до HARDWARE-01) отвечала разом
 * за петли и направляющие модуля — так её и читала смета. Она остаётся
 * ответом для этих двух мест, пока на месте не выбрана своя позиция:
 * выбор места сильнее выбора модуля. Второго ответа на вопрос «какая
 * петля на этом модуле» нет.
 */
export function fittingItemId(
  unit: Pick<Module, 'fittings' | 'hardwareItemId'>,
  slot: FittingSlot,
  bayId?: string,
  /** Деталь фасада (HANDLE-REAL): ручка одной створки. Пусто — место модуля целиком. */
  leaf?: string,
): string | null {
  const own = unit.fittings?.find(
    (f) => f.slot === slot && (f.bayId ?? null) === (bayId ?? null) && (f.leaf ?? null) === (leaf ?? null),
  );
  if (own) return own.itemId;
  if (!bayId && !leaf && (slot === 'hinge' || slot === 'slide') && unit.hardwareItemId) return unit.hardwareItemId;
  return null;
}

/**
 * ПОЗИЦИЯ, КОТОРАЯ СТОИТ НА МЕСТЕ — одна функция на смету и сцену.
 *
 * Выбрана на месте, есть в каталоге организации и не отключена — она; иначе
 * ничего. Прежняя ссылка модуля (`hardwareItemId`) сюда не входит: её смета
 * читает своими общими строками, как до каталога. По этой функции смета
 * снимает штанги отсека с пантографом, а сцена рисует пантограф вместо них.
 */
export function installedItem(
  unit: Pick<Module, 'fittings'>,
  slot: FittingSlot,
  catalog: Map<string, HardwareItem> | undefined,
  bayId?: string,
  leaf?: string,
): HardwareItem | null {
  const id = unit.fittings?.find(
    (f) => f.slot === slot && (f.bayId ?? null) === (bayId ?? null) && (f.leaf ?? null) === (leaf ?? null),
  )?.itemId;
  const item = id ? catalog?.get(id) : undefined;
  return item && item.active ? item : null;
}

/**
 * РУЧКА ЭТОЙ ДЕТАЛИ ФАСАДА (HANDLE-REAL) — одна функция на сцену, смету и экран.
 *
 * Своя у створки сильнее ручки модуля: смена ручки левой двери не трогает
 * правую. Своей нет — ручка модуля. Нет и её — `null`: тогда сцена рисует
 * условную скобу, а смета считает ручку общей строкой.
 */
export function handleItemOf(
  unit: Pick<Module, 'fittings'>,
  leaf: string,
  catalog: Map<string, HardwareItem> | undefined,
): HardwareItem | null {
  return installedItem(unit, 'handle', catalog, undefined, leaf) ?? installedItem(unit, 'handle', catalog);
}

/** Деталь фасада словами: «дверь 2», «ящик 1», «ящик 1 отсека b2». */
export function leafWords(leaf: string): string {
  const bay = /^(b\d+):drawer:(\d+)$/.exec(leaf);
  if (bay) return `ящик ${Number(bay[2]) + 1} отсека ${bay[1]}`;
  const m = /^(door|drawer):(\d+)$/.exec(leaf);
  if (!m) return leaf;
  return `${m[1] === 'door' ? 'дверь' : 'ящик'} ${Number(m[2]) + 1}`;
}

/** Модуль с позицией на месте (или без неё). Пустой список не пишется (ловушка 246). */
export function withFitting(unit: Module, slot: FittingSlot, itemId: string | null, bayId?: string, leaf?: string): Module {
  const rest = (unit.fittings ?? []).filter(
    (f) => !(f.slot === slot && (f.bayId ?? null) === (bayId ?? null) && (f.leaf ?? null) === (leaf ?? null)),
  );
  const next: ModuleFitting[] = itemId
    ? [...rest, { slot, itemId, ...(bayId ? { bayId } : {}), ...(leaf ? { leaf } : {}) }]
    : rest;
  const out: Module = { ...unit };
  if (next.length > 0) {
    /* Порядок записи стабилен: отпечаток не должен зависеть от порядка нажатий. */
    out.fittings = [...next].sort((a, b) =>
      a.slot !== b.slot
        ? a.slot.localeCompare(b.slot)
        : (a.bayId ?? '') !== (b.bayId ?? '')
          ? (a.bayId ?? '').localeCompare(b.bayId ?? '')
          : (a.leaf ?? '').localeCompare(b.leaf ?? ''),
    );
  } else {
    delete out.fittings;
  }
  return out;
}

/**
 * РУЧКА НА МОДУЛЬ ИЛИ НА ДЕТАЛЬ (HANDLE-REAL) — одно правило на операцию
 * и превью карточки. Ручка модуля целиком ставится на все его фасады: свои
 * ручки деталей уходят (экран называет это до нажатия). Ручка детали —
 * только на неё, у второй створки остаётся своя. Снять ручку модуля — свои
 * ручки деталей остаются: их выбирали отдельно.
 */
export function withHandle(unit: Module, itemId: string | null, leaf?: string): Module {
  if (leaf || itemId === null) return withFitting(unit, 'handle', itemId, undefined, leaf);
  const base: Module = { ...unit, fittings: (unit.fittings ?? []).filter((f) => !(f.slot === 'handle' && f.leaf)) };
  return withFitting(base, 'handle', itemId);
}

/** Свои ручки деталей модуля: `door:1` → позиция. */
export function leafHandleFittings(unit: Pick<Module, 'fittings'>): ModuleFitting[] {
  return (unit.fittings ?? []).filter((f) => f.slot === 'handle' && f.leaf);
}

/* ─────────────────────────  Места модуля  ───────────────────────── */

/** Место модуля: что там стоит физически и сколько. */
export type SlotPlace = {
  slot: FittingSlot;
  /** Отсек — у пантографа и выдвижного гардеробного. */
  bayId?: string;
  /** Где это словами: «3 ящика», «отсек 2, штанга». */
  where: string;
  /** Сколько физических изделий нужно на место. */
  quantity: number;
  /** В чём это число: штуки, пары направляющих, механизмы. */
  per: 'piece' | 'pair' | 'mechanism';
  /**
   * Петли двери витрины (P1): стекло в алюминиевой рамке или стекло без
   * рамки. Петля под чашку в фасаде из плиты на такую дверь не встаёт.
   */
  vitrine?: 'alu' | 'glass';
};

/** Геометрия модуля для проверки: все числа — мм. */
type ModuleGeometry = {
  heightMm: number;
  depthMm: number;
  widthMm: number;
  carcassMm: number;
  frontMm: number;
  gapMm: number;
  innerWidthMm: number;
  /** Глубина в свету для полки и ящика: корпус минус припуск цеха. */
  usableDepthMm: number;
};

function geometryOf(unit: Module, run: Run, production: ProductionSettings): ModuleGeometry {
  const heightMm = moduleCarcassHeightMm(unit, run);
  const depthMm = moduleDepthMm(unit, run.zone, run.production);
  const allow = production.allowances ?? DEFAULT_ALLOWANCES;
  return {
    heightMm,
    depthMm,
    widthMm: unit.widthMm,
    carcassMm: production.carcassMm,
    frontMm: production.frontMm,
    gapMm: production.frontGapMm,
    innerWidthMm: unit.widthMm - 2 * production.carcassMm,
    usableDepthMm: depthMm - allow.shelfDepthMm,
  };
}

/** Фурнитура фасадов модуля — тем же счётом, что смета (с углами ряда). */
function frontHardwareOf(unit: Module, run: Run) {
  return openingHardware([{ unit, heightMm: moduleCarcassHeightMm(unit, run) }], run, cornerOfModule(run));
}

function frontHardware(unit: Module, run: Run) {
  return frontHardwareOf(unit, run).byModule[unit.id];
}

/**
 * ФАСАДЫ СО ШТУЧНОЙ РУЧКОЙ И ИХ РАЗМЕР В СВЕТУ ЗАЗОРОВ, мм (HANDLE-REAL).
 *
 * Какие детали несут ручку — тот же счёт, что у сметы (`handleLeaves` из
 * `openingHardware`); размер — из того, что висит на модуле
 * (`moduleFronts`): створки в ряд делят ширину, участки колонны и двери
 * встройки идут на всю ширину друг над другом, фронты ящиков — во всю
 * ширину своей высотой.
 */
export function handleLeafSizes(
  unit: Module,
  run: Run,
  g: Pick<ModuleGeometry, 'heightMm' | 'widthMm' | 'gapMm'>,
): { leaf: string; wMm: number; hMm: number; drawer: boolean }[] {
  const leaves = frontHardwareOf(unit, run).handleLeaves[unit.id] ?? [];
  const fronts = moduleFronts(unit, g.heightMm);
  const sideBySide = fronts.leaves.length > 1 && fronts.leaves.every((s) => s.fromMm === 0 && s.heightMm === g.heightMm);
  return leaves.map((leaf) => {
    const drawer = /^drawer:(\d+)$/.exec(leaf);
    if (drawer) {
      const heightMm = fronts.drawers[Number(drawer[1])] ?? g.heightMm;
      return { leaf, wMm: g.widthMm - 2 * g.gapMm, hMm: heightMm - 2 * g.gapMm, drawer: true };
    }
    const index = Number(/^door:(\d+)$/.exec(leaf)?.[1] ?? 0);
    const span = fronts.leaves[index];
    if (sideBySide) {
      return { leaf, wMm: g.widthMm / fronts.leaves.length - 2 * g.gapMm, hMm: g.heightMm - 2 * g.gapMm, drawer: false };
    }
    return { leaf, wMm: g.widthMm - 2 * g.gapMm, hMm: (span?.heightMm ?? g.heightMm) - 2 * g.gapMm, drawer: false };
  });
}

/**
 * МЕСТА МОДУЛЯ — по фактам, а не по типу.
 *
 * Петли — если на модуле висят полотна на петлях (угловые 175° — своя
 * строка, их место не здесь). Направляющие — если есть фронты ящиков на
 * всю ширину (ящики отсеков выбирают направляющую в своём блоке).
 * Подъёмник — если фасад открывается вверх. Ручки — если ручка модуля
 * скоба. Пантограф и выдвижное — по отсекам со штангой и по отсекам
 * шкафа. Карго, сушка, угол — по варианту места. Опоры — у того, что
 * стоит на полу.
 */
export function fittingSlotsOf(unit: Module, run: Run, production: ProductionSettings = shopOf(run.production)): SlotPlace[] {
  const out: SlotPlace[] = [];
  if (unit.kind === 'filler') return out;
  const hw = frontHardware(unit, run);
  if (hw && hw.frameHinges > 0) {
    /*
     * ДВЕРИ ВИТРИНЫ (P1) — своё место петель: чашку в алюминиевой рамке и в
     * стекле не сверлят. Счёт — тот же `openingHardware`, что у сметы; у
     * двери в рамке петля встаёт на ответную планку корпуса, у стекла без
     * рамки — нет (крепление стекла цехом не подтверждено).
     */
    const glass = hw.glassHinges === hw.frameHinges;
    out.push({
      slot: 'hinge',
      where: glass ? 'петли стеклянных дверей без рамки' : 'петли двери в алюминиевой рамке',
      quantity: hw.hinges + hw.frameHinges,
      per: 'piece',
      vitrine: glass ? 'glass' : 'alu',
    });
    if (!glass) out.push({ slot: 'hinge_plate', where: 'по одной на петлю', quantity: hw.hinges + hw.frameHinges, per: 'piece' });
  } else if (hw && hw.hinges > 0) {
    out.push({ slot: 'hinge', where: 'петли распашных полотен', quantity: hw.hinges, per: 'piece' });
    out.push({ slot: 'hinge_plate', where: 'по одной на петлю', quantity: hw.hinges, per: 'piece' });
  }
  const drawers = frontDrawerSlides(unit);
  if (drawers > 0) out.push({ slot: 'slide', where: `ящиков ${drawers}`, quantity: drawers, per: 'pair' });
  if (hw && hw.lifts > 0) out.push({ slot: 'lift', where: 'фасад вверх', quantity: hw.lifts, per: 'mechanism' });
  if (hw && hw.handleBar > 0) out.push({ slot: 'handle', where: 'скобы на фасадах', quantity: hw.handleBar, per: 'piece' });

  const layout = unit.fill?.bays?.length ? bayLayout(unit, bayEnvelope(unit, run, production)) : null;
  for (const bay of layout?.bays ?? []) {
    if (bay.rods.length > 0) {
      out.push({ slot: 'pantograph', bayId: bay.id, where: `отсек ${bay.index + 1}, штанга`, quantity: 1, per: 'mechanism' });
    }
    if (!bay.drawerStack) {
      out.push({ slot: 'wardrobe_pullout', bayId: bay.id, where: `отсек ${bay.index + 1}`, quantity: 1, per: 'mechanism' });
    }
  }
  if (isPullOut(unit)) out.push({ slot: 'cargo', where: 'выдвижной модуль', quantity: 1, per: 'mechanism' });
  if (unit.variant === 'upper_dryer') out.push({ slot: 'dryer', where: 'над мойкой', quantity: 1, per: 'mechanism' });
  if (unit.kind === 'corner_base') out.push({ slot: 'corner_unit', where: 'угол', quantity: 1, per: 'mechanism' });
  if (standsOnFloor(unit) && unit.kind !== 'corner_base') {
    out.push({ slot: 'leg', where: 'опоры корпуса', quantity: 4, per: 'piece' });
  }
  return out;
}

/* ─────────────────────────  Проверка  ───────────────────────── */

export type FitCheck = {
  /** Что проверено: «толщина фасада», «длина NL». */
  label: string;
  state: 'ok' | 'fail' | 'unknown';
  /** Числа словами: «фасад 16 мм, паспорт 15–24 мм». */
  words: string;
};

export type FittingVerdict = {
  state: 'fits' | 'refused' | 'unverified';
  checks: FitCheck[];
  /** Одна строка для экрана: причина отказа или что не проверено. */
  summary: string;
};

const range = (item: HardwareItem, key: string): [number, number] | null => item.hardware.ranges?.[key] ?? null;
const dim = (item: HardwareItem, key: string): number | null => {
  const v = item.hardware.dimensionsMm?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

function inRange(label: string, value: number, r: [number, number] | null, what: string, unit = 'мм'): FitCheck {
  if (!r) return { label, state: 'unknown', words: `${what} ${value} ${unit}: в паспорте предела нет` };
  const ok = value >= r[0] && value <= r[1];
  return {
    label,
    state: ok ? 'ok' : 'fail',
    words: `${what} ${value} ${unit}, по паспорту ${r[0]}–${r[1]} ${unit}${ok ? '' : ` — ${value < r[0] ? `меньше на ${r[0] - value}` : `больше на ${value - r[1]}`} ${unit}`}`,
  };
}

function atMost(label: string, need: number | null, has: number, what: string): FitCheck {
  if (need === null) return { label, state: 'unknown', words: `${what}: в паспорте числа нет` };
  const ok = need <= has;
  return {
    label,
    state: ok ? 'ok' : 'fail',
    words: `${what}: нужно ${need} мм, есть ${has} мм${ok ? '' : ` — не хватает ${Math.round((need - has) * 10) / 10} мм`}`,
  };
}

/**
 * НАЛОЖЕНИЕ ПЕТЛИ С ПЛАНКОЙ — по таблице паспорта.
 *
 * Фасад закрывает боковину на толщину корпуса минус зазор цеха (FA).
 * Паспорт петли печатает, какое наложение FA даёт каждая высота ответной
 * планки MD при расстоянии чашки TB от кромки в своём пределе
 * (`ranges.overlayMd<MD>`, `ranges.boringDistance`). Отсюда при выбранной
 * планке TB = FA − FA мин. + TB мин.: FA вне строки планки — петля с этой
 * планкой фасад не закроет так, как нарисован. Строки нет — не проверено.
 */
function overlayRows(hinge: HardwareItem): { md: number; range: [number, number] }[] {
  return Object.entries(hinge.hardware.ranges ?? {})
    .map(([key, value]) => ({ m: /^overlayMd(-?\d+(?:\.\d+)?)$/.exec(key), value }))
    .filter((row): row is { m: RegExpExecArray; value: [number, number] } => row.m !== null)
    .map((row) => ({ md: Number(row.m[1]), range: row.value }))
    .sort((a, b) => a.md - b.md);
}

export function overlayCheck(
  g: { carcassMm: number; gapMm: number },
  hinge: HardwareItem,
  plate: HardwareItem | null,
  plateChosen: boolean,
): FitCheck {
  const fa = g.carcassMm - g.gapMm;
  const tb = range(hinge, 'boringDistance');
  const rows = overlayRows(hinge);
  if (!tb || rows.length === 0) {
    return { label: 'наложение', state: 'unknown', words: `наложение ${fa} мм: таблицы наложения по планкам в паспорте петли нет` };
  }
  const fitting = rows.filter((row) => fa >= row.range[0] && fa <= row.range[1]);
  if (!plate) {
    return {
      label: 'наложение',
      state: fitting.length > 0 ? 'unknown' : 'fail',
      words:
        fitting.length > 0
          ? `наложение ${fa} мм: ответная планка ${plateChosen ? 'не найдена в каталоге' : 'не выбрана'} — подойдёт MD ${fitting.map((row) => row.md).join(', ')} мм`
          : `наложение ${fa} мм этой петлёй не получить ни с одной планкой: по паспорту ${rows.map((row) => `MD ${row.md} — ${row.range[0]}–${row.range[1]}`).join(', ')} мм`,
    };
  }
  const md = dim(plate, 'plateHeight');
  if (md === null) return { label: 'наложение', state: 'unknown', words: `у планки «${plate.name}» нет высоты MD — наложение не проверить` };
  const row = rows.find((r) => r.md === md);
  if (!row) {
    return { label: 'наложение', state: 'unknown', words: `для планки MD ${md} мм в паспорте петли строки наложения нет` };
  }
  const ok = fa >= row.range[0] && fa <= row.range[1];
  const value = Math.round((fa - row.range[0] + tb[0]) * 10) / 10;
  return {
    label: 'наложение',
    state: ok ? 'ok' : 'fail',
    words: ok
      ? `наложение ${fa} мм с планкой MD ${md}: TB = ${value} мм (паспорт: FA ${row.range[0]}–${row.range[1]} при TB ${tb[0]}–${tb[1]})`
      : `наложение ${fa} мм с планкой MD ${md} не получить: по паспорту ${row.range[0]}–${row.range[1]} мм`,
  };
}

/** TB чашки петли с планкой — для присадки; `null` — не вычисляется. */
export function hingeBoringMm(g: { carcassMm: number; gapMm: number }, hinge: HardwareItem, plate: HardwareItem | null): number | null {
  const check = overlayCheck(g, hinge, plate, plate !== null);
  if (check.state !== 'ok' || !plate) return null;
  const tb = range(hinge, 'boringDistance')!;
  const md = dim(plate, 'plateHeight')!;
  const row = overlayRows(hinge).find((r) => r.md === md)!;
  return Math.round((g.carcassMm - g.gapMm - row.range[0] + tb[0]) * 10) / 10;
}

/**
 * ВСТАЁТ ЛИ ПОЗИЦИЯ НА МЕСТО МОДУЛЯ — по паспорту и по геометрии.
 *
 * Отказ (`refused`) — хотя бы одна проверка с числом не прошла, позиции
 * не той группы или места на модуле нет. «Не проверено» (`unverified`) —
 * отказа нет, но чего-то в паспорте или в правилах цеха нет, и это
 * названо. «Встаёт» (`fits`) — всё проверено числами.
 */
export function fittingVerdict(input: {
  unit: Module;
  run: Run;
  slot: FittingSlot;
  item: HardwareItem;
  bayId?: string;
  /** Деталь фасада (HANDLE-REAL): ручка одной створки или одного ящика. */
  leaf?: string;
  production?: ProductionSettings;
  /** Каталог организации: петле нужна её планка, планке — её петля. */
  catalog?: Map<string, HardwareItem>;
}): FittingVerdict {
  const { unit, run, slot, item, bayId } = input;
  const production = input.production ?? shopOf(run.production);
  const checks: FitCheck[] = [];
  const refuse = (words: string): FittingVerdict => ({ state: 'refused', checks: [{ label: 'место', state: 'fail', words }], summary: words });

  if (!item.active) return refuse(`«${item.name}» отключена в каталоге организации.`);
  if (!slotAccepts(slot, item)) {
    return refuse(`«${item.name}» — не ${FITTING_SLOT_TITLE[slot].toLowerCase()}: эта позиция ставится на другое место.`);
  }
  const place = fittingSlotsOf(unit, run, production).find((p) => p.slot === slot && (p.bayId ?? null) === (bayId ?? null));
  if (!place) {
    /* Места ручки нет из-за типа ручки модуля (HANDLE-REAL) — так и сказано, с тем, что нажать. */
    const kind = slot === 'handle' ? handleOf(unit, run).handle : null;
    if (kind && kind !== 'bar') {
      return refuse(
        `У «${unit.label}» тип ручки «${HANDLE_TITLE[kind]}» — штучной ручки на фасадах нет: сначала выберите «${HANDLE_TITLE.bar}» у модуля.`,
      );
    }
    return refuse(`У «${unit.label}» нет места «${FITTING_SLOT_TITLE[slot]}»${bayId ? ` в отсеке ${bayId}` : ''}.`);
  }

  const g = geometryOf(unit, run, production);
  const status = item.hardware.engineeringStatus;
  if (status === 'CONFLICT' || status === 'NOT_READABLE' || status === 'MISSING_DATA') {
    checks.push({
      label: 'паспорт',
      state: 'unknown',
      words:
        status === 'CONFLICT'
          ? 'источник противоречит сам себе — числа не применяются'
          : status === 'NOT_READABLE'
            ? 'данные в источнике не читаются'
            : 'технических данных в источнике нет',
    });
  }

  switch (slot) {
    case 'hinge': {
      /*
       * ДВЕРЬ ВИТРИНЫ (P1). Петля под чашку в фасаде из плиты на стекло и на
       * алюминиевую рамку не встаёт; петли «для алюминиевых рамок» в фактах
       * производителей — только подъёмника AVENTOS HF, а дверь витрины
       * распашная. Петля под рамку или под стекло (позиция организации) —
       * «не проверено»: сечения профиля и толщины стекла в паспорте рамки нет.
       */
      if (place.vitrine) {
        const text = `${item.name} ${item.hardware.officialName ?? ''} ${item.hardware.variant ?? ''} ${item.hardware.compatibleWith ?? ''}`.toLowerCase();
        const lift = /(^|\s)lift_|aventos/.test(text);
        const forFrame = /алюмин\S*\s+рамк/.test(text);
        const forGlass = /стекл/.test(text);
        if (lift) {
          return refuse(`«${item.name}» — петля подъёмника, а дверь витрины распашная: на неё нужна распашная петля ${place.vitrine === 'glass' ? 'для стекла' : 'для алюминиевых рамок'}.`);
        }
        if (place.vitrine === 'alu' && !forFrame) {
          return refuse(
            `«${item.name}» — петля под чашку в фасаде из плиты: у двери в алюминиевой рамке чашку сверлить некуда. Нужна распашная петля для алюминиевых рамок.`,
          );
        }
        if (place.vitrine === 'glass' && !forGlass) {
          return refuse(`«${item.name}» — петля под чашку в фасаде из плиты: у стеклянной двери без рамки чашки нет. Нужна петля для стекла.`);
        }
        checks.push({ label: 'конструкция', state: 'ok', words: place.vitrine === 'glass' ? 'петля для стекла' : 'петля для алюминиевых рамок' });
        checks.push({
          label: 'профиль',
          state: 'unknown',
          words:
            place.vitrine === 'glass'
              ? 'толщина стекла и крепление петли к стеклу цехом не подтверждены — посадку проверить нечем'
              : 'сечение профиля рамки не задано — посадку петли на рамку проверить нечем',
        });
        break;
      }
      checks.push(inRange('толщина фасада', g.frontMm, range(item, 'doorThickness'), 'фасад'));
      const kind = item.hardware.subcategory;
      checks.push(
        kind === 'overlay'
          ? { label: 'конструкция', state: 'ok', words: 'накладная — фасады модуля накладные на свои боковины' }
          : kind === 'half_overlay' || kind === 'inset'
            ? {
                label: 'конструкция',
                state: 'fail',
                words: `${kind === 'inset' ? 'вкладная' : 'полунакладная'} петля, а фасады модуля накладные на свои боковины`,
              }
            : { label: 'конструкция', state: 'unknown', words: 'в паспорте не указано, накладная ли петля' },
      );
      /*
       * НАЛОЖЕНИЕ — ПО ФОРМУЛЕ ПАСПОРТА И ВЫСОТЕ ПЛАНКИ.
       *
       * Фасад закрывает боковину на толщину корпуса минус зазор цеха.
       * Расстояние от кромки до чашки — из формулы производителя (FA =
       * TB + основание − MD) и высоты выбранной планки. Планка не выбрана
       * — не проверено, и названо, какие подошли бы.
       */
      const plateId = fittingItemId(unit, 'hinge_plate');
      checks.push(overlayCheck(g, item, plateId ? (input.catalog?.get(plateId) ?? null) : null, plateId !== null));
      break;
    }
    case 'hinge_plate': {
      const md = dim(item, 'plateHeight');
      checks.push(
        md === null
          ? { label: 'высота планки', state: 'unknown', words: 'высоты планки MD в паспорте нет' }
          : { label: 'высота планки', state: 'ok', words: `планка MD ${md} мм` },
      );
      const hingeId = fittingItemId(unit, 'hinge');
      const hinge = hingeId ? (input.catalog?.get(hingeId) ?? null) : null;
      if (!hinge) {
        checks.push({
          label: 'наложение',
          state: 'unknown',
          words: `наложение ${g.carcassMm - g.gapMm} мм: петля ${hingeId ? 'не найдена в каталоге' : 'не выбрана'} — TB не вычислить`,
        });
      } else {
        checks.push(overlayCheck(g, hinge, item, true));
      }
      break;
    }
    case 'slide': {
      const geo = runnerGeometry(item);
      if (geo.mount === 'under') {
        checks.push({
          label: 'короб',
          state: 'unknown',
          words: 'скрытая направляющая: короб под неё — своя конструкция (дно утоплено, ширина по формуле), в правилах цеха её нет',
        });
      }
      if (geo.mount === 'other') {
        checks.push({
          label: 'короб',
          state: 'unknown',
          words: `направляющая не боковая шариковая (${item.hardware.subcategory}): короб под неё — своя конструкция, в правилах цеха её нет`,
        });
      }
      /* Боковина КОРПУСА по паспорту — у KA «≥ 16» на разрезе стоит у неё, а не у ящика. */
      const minSide = dim(item, 'minCabinetSide');
      if (minSide !== null) {
        checks.push({
          label: 'боковина корпуса',
          state: g.carcassMm >= minSide ? 'ok' : 'fail',
          words: `корпус цеха ${g.carcassMm} мм, по паспорту от ${minSide} мм`,
        });
      }
      checks.push(atMost('длина NL', geo.nominalLengthMm, g.usableDepthMm, 'направляющая в корпусе'));
      if (geo.minCabinetDepthMm !== null) {
        checks.push(atMost('глубина корпуса KT', geo.minCabinetDepthMm, g.usableDepthMm, 'глубина корпуса в свету для накладного фасада'));
      } else {
        checks.push({ label: 'глубина корпуса KT', state: 'unknown', words: 'минимальной глубины корпуса в паспорте нет' });
      }
      const rules = drawerBoxRulesOf(production.drawerBox);
      if (!rules) {
        checks.push({ label: 'короб', state: 'unknown', words: 'правил короба цеха нет — короб не рассчитывается' });
      } else {
        if (geo.minDrawerSideMm !== null || geo.maxDrawerSideMm !== null) {
          const lo = geo.minDrawerSideMm ?? 0;
          const hi = geo.maxDrawerSideMm ?? Number.POSITIVE_INFINITY;
          const ok = rules.boxSideMm >= lo && rules.boxSideMm <= hi;
          checks.push({
            label: 'боковина ящика',
            state: ok ? 'ok' : 'fail',
            words: `боковина короба цеха ${rules.boxSideMm} мм, по паспорту ${geo.minDrawerSideMm !== null ? `от ${geo.minDrawerSideMm}` : ''}${geo.maxDrawerSideMm !== null ? ` до ${geo.maxDrawerSideMm}` : ''} мм`,
          });
        }
        const profile = drawerProfileFor({
          slide: item,
          slideItemId: item.id,
          rules,
          openingWidthMm: g.innerWidthMm,
          usableDepthMm: g.usableDepthMm,
          overlay: true,
        });
        if (!profile.ready) {
          for (const m of profile.missing) {
            if (!checks.some((c) => c.words === m)) checks.push({ label: 'короб', state: /длиннее|не хватает|тоньше|толще|ничего не остаётся/.test(m) ? 'fail' : 'unknown', words: m });
          }
        } else if (!profile.profile.confirmed) {
          checks.push({ label: 'выпуск', state: 'unknown', words: 'правила короба не подтверждены цехом или паспорт неполный — выпуск в цех заперт' });
        }
      }
      break;
    }
    case 'lift': {
      const frontH = g.heightMm - g.gapMm;
      checks.push(inRange('высота корпуса', g.heightMm, range(item, 'cabinetHeight'), 'корпус'));
      checks.push(inRange('высота фасада', frontH, range(item, 'frontHeight'), 'фасад'));
      checks.push(inRange('ширина фасада', g.widthMm - 2 * g.gapMm, range(item, 'frontWidth'), 'фасад'));
      checks.push(inRange('толщина фасада', g.frontMm, range(item, 'doorThickness'), 'фасад'));
      const pf = range(item, 'powerFactor');
      checks.push({
        label: 'фактор мощности',
        state: 'unknown',
        words: pf
          ? `фактор мощности ${pf[0]}–${pf[1]}: веса фасада нет (плотность материала фасада не задана) — не проверено`
          : 'фактора мощности в паспорте нет — по весу фасада не проверено',
      });
      const minDepth = dim(item, 'minInnerDepth');
      if (minDepth !== null) checks.push(atMost('глубина корпуса', minDepth, g.usableDepthMm, 'глубина корпуса в свету'));
      const minHeight = dim(item, 'minInnerHeight');
      if (minHeight !== null) checks.push(atMost('высота корпуса в свету', minHeight, g.heightMm - 2 * g.carcassMm, 'высота корпуса в свету'));
      const maxWidth = dim(item, 'maxCabinetWidth');
      if (maxWidth !== null) {
        checks.push({
          label: 'ширина корпуса',
          state: g.widthMm <= maxWidth ? 'ok' : 'fail',
          words: `корпус ${g.widthMm} мм, по паспорту до ${maxWidth} мм`,
        });
      }
      if (range(item, 'carcassSide')) checks.push(inRange('боковина корпуса', g.carcassMm, range(item, 'carcassSide'), 'боковина цеха'));
      /*
       * СКЛАДНОЙ ПОДЪЁМНИК ДЕРЖИТ ФАСАД ИЗ ДВУХ ЧАСТЕЙ — у модуля фасад один.
       * Вид хода — класс механизма (`mechanismOf`), а не буквы «hf» в подвиде:
       * по буквам ловился только Blum HF top, а складной FREE FOLD Häfele
       * (`bifold_lift`) вставал на цельный фасад как обычный подъёмник.
       */
      const mechanism = mechanismOf(item);
      if (isMechanism(mechanism) && mechanism.type === 'bifold') {
        checks.push({ label: 'фасад', state: 'fail', words: 'складной подъёмник — фасад из двух частей, а у модуля фасад один' });
      }
      /* Вертикальный и откидной над корпусом ходят не поворотом: сцена их хода пока не строит, место над корпусом не проверено. */
      if (isMechanism(mechanism) && (mechanism.type === 'parallel' || mechanism.type === 'up_and_over')) {
        checks.push({
          label: 'ход',
          state: 'unknown',
          words: `${TYPE_TITLE[mechanism.type]}: ход этого вида в сцене не построен — показан поворот вверх, место над корпусом не проверено`,
        });
      }
      if (openingOf(unit).opening !== 'lift') {
        checks.push({ label: 'открывание', state: 'fail', words: 'фасад модуля открывается не вверх — сначала выберите «Вверх (подъёмник)»' });
      }
      break;
    }
    case 'handle': {
      /*
       * РУЧКА — ПО ВИДУ И ПО МЕСТУ НА КАЖДОМ ФАСАДЕ (HANDLE-REAL).
       *
       * Штучная ручка (скоба, кнопка, врезная, для кромок) ставится, когда у
       * модуля тип «Скоба»: так её и считает смета. Профиль системы без ручек
       * (Gola) крепится к корпусу между столешницей и укороченным фасадом —
       * такой конструкции в правилах цеха нет, и на фасад модуля он не
       * встаёт. Помещается ли ручка — по каждому фасаду, где она будет, с
       * поворотом планки: вертикальная скоба меряется высотой полотна.
       */
      const { handle } = handleOf(unit, run);
      const shaped = handleItemModel(item);
      if (item.hardware.subcategory === 'profile_handle') {
        checks.push({ label: 'конструкция', state: 'fail', words: shaped.words });
        break;
      }
      checks.push(
        handle === 'bar'
          ? { label: 'тип ручки', state: 'ok', words: 'у модуля штучная ручка на каждом фасаде' }
          : {
              label: 'тип ручки',
              state: 'fail',
              words: `у модуля тип ручки «${handle === 'profile' ? 'профиль' : 'без ручки'}» — сначала выберите «Скоба» у модуля`,
            },
      );
      const leaves = handleLeafSizes(unit, run, g);
      const targets = input.leaf ? leaves.filter((l) => l.leaf === input.leaf) : leaves;
      if (input.leaf && targets.length === 0) {
        return refuse(`У «${unit.label}» нет фасада «${leafWords(input.leaf)}» со штучной ручкой.`);
      }
      if (!shaped.model) {
        checks.push({ label: 'модель', state: 'unknown', words: `${shaped.words} — в сцене будет условная скоба` });
        break;
      }
      const model = shaped.model;
      const misfit = targets
        .map((l) => {
          const turn = l.drawer ? 'horizontal' : handleSpotOf(unit, run).turn;
          const along = model.shape === 'bar' && turn === 'vertical' ? l.hMm : l.wMm;
          const need =
            model.shape === 'knob' || model.shape === 'flush'
              ? { size: model.diameterMm, room: Math.min(l.wMm, l.hMm), what: `ручка Ø${model.diameterMm}` }
              : { size: model.lengthMm, room: along, what: `ручка ${model.lengthMm} мм` };
          return { l, ...need };
        })
        .find((x) => x.size > x.room);
      checks.push(
        misfit
          ? {
              label: 'длина ручки',
              state: 'fail',
              words: `${misfit.what} не помещается на ${leafWords(misfit.l.leaf)}: фасад ${Math.round(misfit.room)} мм — не хватает ${Math.round((misfit.size - misfit.room) * 10) / 10} мм`,
            }
          : {
              label: 'длина ручки',
              state: 'ok',
              words: `${targets.length === 1 ? leafWords(targets[0].leaf) : `фасадов ${targets.length}`}: ручка помещается`,
            },
      );
      break;
    }
    case 'pantograph':
    case 'wardrobe_pullout': {
      const layout = bayLayout(unit, bayEnvelope(unit, run, production));
      const bay = layout?.bays.find((b) => b.id === bayId);
      if (!bay) return refuse(`Отсека ${bayId ?? '—'} у «${unit.label}» нет.`);
      checks.push(inRange('ширина отсека', bay.widthMm, range(item, 'cabinetInnerWidth'), 'отсек в свету'));
      const minDepth = dim(item, 'minInnerDepth');
      if (minDepth !== null) checks.push(atMost('глубина отсека', minDepth, g.usableDepthMm, 'глубина в свету'));
      const length = dim(item, 'length');
      if (slot === 'wardrobe_pullout' && item.hardware.subcategory === 'pullout_rod' && length !== null) {
        checks.push(atMost('длина штанги', length, g.usableDepthMm, 'выдвижная штанга вдоль глубины'));
      }
      checks.push({ label: 'присадка', state: 'unknown', words: 'присадки и опорных плоскостей в источнике нет — движение условное' });
      break;
    }
    case 'cargo':
    case 'dryer':
    case 'corner_unit':
    case 'waste': {
      /* Вид выдвижного — тот, что выбран у модуля: бутылочница, карго, высокое карго — разные изделия. */
      if (slot === 'cargo') {
        const wants = unit.variant === 'tall_cargo' ? 'tall_cargo' : unit.variant === 'bottle' ? 'bottle' : 'cargo';
        const kind = item.hardware.subcategory ?? '';
        if (kind !== wants) {
          checks.push({ label: 'вид', state: 'fail', words: `позиция — ${CARGO_WORD[kind] ?? kind}, а модуль — ${CARGO_WORD[wants]}` });
        }
      }
      const nominal = dim(item, 'cabinetWidth');
      checks.push(
        nominal === null
          ? inRange('ширина корпуса', g.widthMm, range(item, 'cabinetWidth'), 'корпус')
          : {
              label: 'ширина корпуса',
              state: nominal === g.widthMm ? 'ok' : 'fail',
              words: `корпус ${g.widthMm} мм, позиция — под корпус ${nominal} мм`,
            },
      );
      const minDepth = dim(item, 'minInnerDepth');
      checks.push(
        minDepth === null
          ? { label: 'глубина', state: 'unknown', words: 'минимальной глубины корпуса в паспорте нет' }
          : atMost('глубина', minDepth, g.usableDepthMm, 'глубина корпуса в свету'),
      );
      const h = range(item, 'cabinetInnerHeight');
      if (h) checks.push(inRange('высота в свету', g.heightMm - 2 * g.carcassMm, h, 'корпус в свету'));
      if (slot === 'dryer' && !isUpperRow(unit)) checks.push({ label: 'ряд', state: 'fail', words: 'сушилка ставится в верхний шкаф' });
      break;
    }
    case 'leg': {
      const plinth = production.heights?.plinthMm;
      checks.push(
        plinth === undefined
          ? { label: 'высота опоры', state: 'unknown', words: 'высоты цоколя в настройках цеха нет' }
          : inRange('высота опоры', plinth, range(item, 'legHeight'), 'цоколь'),
      );
      break;
    }
    case 'shelf_support': {
      checks.push({ label: 'присадка', state: 'unknown', words: 'отверстия полкодержателей — по правилу цеха; не задано — не сверлятся' });
      break;
    }
  }

  /* Источник противоречит сам себе (CONFLICT): по его числам «встаёт» не говорим — только «не проверено». */
  if (item.hardware.engineeringStatus === 'CONFLICT') {
    checks.push({ label: 'источник', state: 'unknown', words: 'данные позиции в каталоге производителя противоречат друг другу — сверьте с производителем' });
  }
  const failed = checks.find((c) => c.state === 'fail');
  if (failed) return { state: 'refused', checks, summary: `Не встаёт: ${failed.words}.` };
  const unknown = checks.filter((c) => c.state === 'unknown');
  if (unknown.length > 0) {
    return { state: 'unverified', checks, summary: `Встаёт, но не проверено: ${unknown.map((c) => c.words).slice(0, 2).join('; ')}.` };
  }
  return { state: 'fits', checks, summary: 'Встаёт: всё проверено по паспорту.' };
}

/**
 * СИСТЕМА КУПЕ РЯДА — встаёт ли (HARDWARE-01).
 *
 * Полотна купе закрывают ряд целиком: число полотен считает
 * `slidingDoorCount` — та же функция, что смета. Комплект на 2 двери на
 * ряд из 3 полотен не встаёт. Толщины и веса полотна купе в продукте нет
 * (полотна в раскрой не режутся), и это не проверено — словами.
 */
/**
 * КОМПЛЕКТ СИСТЕМЫ КУПЕ — то, что ставится на ряд. Шина, демпфер, ролик
 * — части системы: ими полотно не повесить, и систему купе они не заменяют.
 */
const SLIDING_KITS = new Set(['sliding_kit', 'top_running_overlay_front_door_set', 'top_running_overlay_rear_door_set']);

export function slidingAccepts(item: Pick<HardwareItem, 'hardware'>): boolean {
  return item.hardware.category === 'sliding' && SLIDING_KITS.has(item.hardware.subcategory ?? '');
}

export function slidingVerdict(run: Run, item: HardwareItem, production: ProductionSettings): FittingVerdict {
  const refuse = (words: string): FittingVerdict => ({ state: 'refused', checks: [{ label: 'место', state: 'fail', words }], summary: words });
  if (!item.active) return refuse(`«${item.name}» отключена в каталоге организации.`);
  if (item.hardware.category !== 'sliding') return refuse(`«${item.name}» — не система купе.`);
  if (!slidingAccepts(item)) {
    return refuse(`«${item.name}» — часть системы купе (${item.hardware.subcategory ?? 'без подвида'}), а не комплект: на ряд ставится комплект на дверь.`);
  }
  if (run.doorSystem !== 'sliding') return refuse('у ряда распашные двери: системе купе стоять не на чем.');
  const doors = slidingDoorCount(run.lengthMm);
  const checks: FitCheck[] = [];
  const kit = dim(item, 'doorsInKit');
  checks.push(
    kit === null
      ? { label: 'комплект', state: 'unknown', words: 'на сколько дверей комплект — в паспорте нет' }
      : {
          label: 'комплект',
          state: kit === doors ? 'ok' : 'fail',
          words: `комплект на ${kit} ${kit === 1 ? 'дверь' : 'двери'}, ряду ${run.lengthMm} мм нужно полотен: ${doors}`,
        },
  );
  const thickness = range(item, 'doorThickness');
  checks.push({
    label: 'толщина полотна',
    state: 'unknown',
    words: `толщина полотна купе в продукте не задана${thickness ? ` — с паспортом ${thickness[0]}–${thickness[1]} мм не сверено` : ''}`,
  });
  const maxKg = item.hardware.loadCapacityKg;
  checks.push({
    label: 'вес полотна',
    state: 'unknown',
    words: `вес полотна не известен${maxKg ? ` — предел паспорта ${maxKg} кг не проверен` : ''}`,
  });
  void production;
  /* Источник противоречит сам себе (CONFLICT): по его числам «встаёт» не говорим — только «не проверено». */
  if (item.hardware.engineeringStatus === 'CONFLICT') {
    checks.push({ label: 'источник', state: 'unknown', words: 'данные позиции в каталоге производителя противоречат друг другу — сверьте с производителем' });
  }
  const failed = checks.find((c) => c.state === 'fail');
  if (failed) return { state: 'refused', checks, summary: `Не встаёт: ${failed.words}.` };
  return {
    state: 'unverified',
    checks,
    summary: `Встаёт, но не проверено: ${checks.filter((c) => c.state === 'unknown').map((c) => c.words).slice(0, 2).join('; ')}.`,
  };
}
