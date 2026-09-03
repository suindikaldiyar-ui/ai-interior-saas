import { APPLIANCE_SLOTS } from './modules';
import { MODULE_VARIANTS } from './moduleVariants';
import { sectionSpec } from './sections';
import type { RunModuleLike } from '@/lib/kitchen';
import type { ApplianceKind, ModuleVariantKind, SectionKind } from '@/types/millwork';

/**
 * ЧТО У КАЖДОГО МОДУЛЯ ЗА ФАСАДОМ — СЛОВАМИ ДЛЯ ВИЗУАЛИЗАЦИИ.
 *
 * Блок «СОСТАВ ГАРНИТУРА» называл приборы и ширины, но НЕ говорил, что у
 * модуля за фасадом. Пустоту модель заполняет по-своему: рисует всё
 * сплошными дверцами. На чертеже ящики, витрина и открытая ниша — на
 * картинке их нет, и клиент видит одно, а подписывает другое.
 *
 * Числа берутся из `Run` (через мету сцены), руками здесь не пишется ничего.
 */

/** Что видно снаружи у одного модуля. */
export type FrontDescription = {
  fromMm: number;
  toMm: number;
  text: string;
  /** Сколько отдельных ящичных фронтов у модуля: их сверяет приёмка. */
  drawerFronts: number;
};

function applianceTitle(kind: string | undefined): string {
  return kind ? (APPLIANCE_SLOTS[kind as ApplianceKind]?.title.toLowerCase() ?? kind) : '';
}

/**
 * Описание фасада по варианту.
 *
 * Витрина, карго, сушилка и подъёмник названы прямо: это то, чего модель
 * не догадается нарисовать, а клиент за это заплатил.
 */
function variantText(variant: ModuleVariantKind, unit: RunModuleLike): string | null {
  switch (variant) {
    case 'upper_glass':
      return 'СТЕКЛЯННАЯ ДВЕРЬ В РАМЕ: прозрачное стекло, сквозь него видны полки';
    case 'upper_display':
      return (
        'ВИТРИНА: прозрачная стеклянная дверь в раме, внутри стеклянные полки, ' +
        'LED-лента по контуру, подсветка ВКЛЮЧЕНА'
      );
    case 'tall_display':
      return 'ВИТРИНА во всю высоту: стеклянная дверь, полки видны, подсветка включена';
    case 'upper_open':
    case 'open_base':
      return 'ОТКРЫТАЯ НИША без фасада: видны полки и то, что на них стоит';
    case 'upper_micro':
      return 'открытая ниша под микроволновку: прибор стоит внутри, дверцы нет';
    case 'cargo':
    case 'tall_cargo':
      return `узкий выдвижной фасад карго ${unit.widthMm} мм — одна вертикальная панель`;
    case 'upper_dryer':
      return 'фасад глухой, внутри сушилка для посуды';
    case 'upper_lift':
      return 'фасад ПОДЪЁМНЫЙ: одна цельная панель, открывается вверх, ручка снизу';
    case 'drawers_four':
      return 'ЧЕТЫРЕ ЯЩИКА: четыре горизонтальных фронта со швами между ними';
    case 'drawers_door':
      return 'верхний ЯЩИК, под ним сплошная створка';
    case 'door_two':
      return 'ДВЕ СТВОРКИ с швом посередине';
    case 'sink_base':
      return 'модуль под мойку: одна створка, мойка врезана в столешницу над ним';
    case 'hob_base':
      return 'варочная панель врезана в столешницу сверху, под ней ДВА ЯЩИКА';
    case 'tall_rod':
      return 'за фасадом штанга для одежды';
    default:
      return null;
  }
}

/** Описание одного модуля: диапазон по стене и что видно снаружи. */
export function describeFront(unit: RunModuleLike): FrontDescription {
  const from = Math.round(unit.offsetMm);
  const to = Math.round(unit.offsetMm + unit.widthMm);

  const drawerCount = Number(unit.drawerCount ?? 0);
  const variant = unit.variant as ModuleVariantKind | undefined;

  let text: string;
  let drawerFronts = 0;

  if (unit.column) {
    text =
      `колонна: снизу ${applianceTitle(unit.column.bottom)}, ` +
      `сверху ${applianceTitle(unit.column.top)} — две тёмные врезки в один фасад`;
  } else if (unit.appliance) {
    const title = applianceTitle(unit.appliance);
    text =
      unit.builtIn === false
        ? `${title} отдельностоящий, БЕЗ фасада — виден целиком`
        : unit.appliance === 'fridge'
          ? 'холодильник встроенный, закрыт фасадом заподлицо'
          : unit.appliance.startsWith('sink')
            ? `${title}: врезана в столешницу, под ней одна створка`
            : unit.appliance === 'hob'
              ? `${title}: врезана в столешницу, под ней ящики`
              : unit.appliance === 'hood'
                ? `${title} встроена в шкаф`
                : `${title}, закрыт фасадом`;
    if (unit.appliance === 'hob') drawerFronts = 2;
  } else if (variant && variantText(variant, unit)) {
    text = variantText(variant, unit) as string;
    const spec = MODULE_VARIANTS[variant];
    if (spec?.frontType === 'drawers') drawerFronts = spec.drawerCount ?? drawerCount;
  } else if (unit.section) {
    const spec = sectionSpec(unit.section as SectionKind);
    text = spec ? `${spec.title.toLowerCase()} (${spec.hint})` : 'секция шкафа';
  } else if (unit.frontType === 'drawers' && drawerCount > 0) {
    text =
      `${drawerCount} ЯЩИКА: ${drawerCount} горизонтальных фронта со швами между ними, ` +
      'не одна дверца';
    drawerFronts = drawerCount;
  } else if (unit.frontType === 'none') {
    text = 'ОТКРЫТАЯ НИША без фасада: видны полки';
  } else {
    text = 'глухой фасад — цельная панель во всю высоту модуля';
  }

  return { fromMm: from, toMm: to, text, drawerFronts };
}

/** Все модули ряда, сверху вниз по рядам и слева направо. */
export function describeFronts(modules: RunModuleLike[]): FrontDescription[] {
  return [...modules]
    .sort((a, b) => a.offsetMm - b.offsetMm)
    .map(describeFront);
}

/**
 * Заголовки рядов.
 *
 * По ним же промпт потом РАЗБИРАЕТСЯ обратно при сверке: заголовок и
 * разборщик обязаны знать друг о друге, иначе сверка считает строки не
 * того ряда и падает на верном составе.
 */
export const BASE_ROW_TITLE = 'НИЖНИЙ РЯД';
export const UPPER_ROW_TITLE = 'ВЕРХНИЙ РЯД';
export const NO_UPPER_ROW = 'ВЕРХНЕГО РЯДА НЕТ: стена над столешницей открыта.';

/** Строки блока: «0–600 пенал: холодильник встроенный…». */
export function frontsBlock(title: string, modules: RunModuleLike[]): string {
  const rows = describeFronts(modules).map(
    (f) => `  ${f.fromMm}–${f.toMm} ${f.text}`,
  );
  return `${title}:\n${rows.join('\n')}`;
}

/** Строка описания модуля: два пробела, диапазон, текст. */
const FRONT_ROW = /^ {2}\d+–\d+ /;

/**
 * Сколько модулей описано в каждом ряду.
 *
 * Считаем ПО РЯДАМ, а не всё подряд: в промпте два блока, и общая сумма
 * строк не сходится ни с нижним рядом, ни с верхним. Именно на этом сверка
 * падала ложно — «в промпте 13 модулей, а в ряду 7».
 */
export function countFrontRows(prompt: string): { base: number; upper: number } {
  const counts = { base: 0, upper: 0 };
  let current: 'base' | 'upper' | null = null;

  for (const line of prompt.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith(BASE_ROW_TITLE)) {
      current = 'base';
      continue;
    }
    if (trimmed.startsWith(UPPER_ROW_TITLE) || trimmed.startsWith('ВЕРХНЕГО РЯДА НЕТ')) {
      current = 'upper';
      continue;
    }

    if (current && FRONT_ROW.test(line)) counts[current] += 1;
  }

  return counts;
}

/**
 * ЖЁСТКИЕ ПРАВИЛА.
 *
 * Идут в `GEOMETRY_LOCK` ДО описания стиля: стиль модель читает как
 * пожелание, а `GEOMETRY_LOCK` — как ограничение, и порядок здесь имеет
 * значение.
 */
export function frontRules(moduleCount: number): string {
  return `ЯЩИКИ И ДВЕРЦЫ РАЗЛИЧАЮТСЯ.
Ящик — горизонтальный фронт со швом сверху и снизу; три ящика подряд это
три фронта, а не одна дверца. Дверца — цельная панель во всю высоту модуля.
Нарисовать ящики дверцами — ошибка.

ОТКРЫТЫЕ СЕКЦИИ И ВИТРИНЫ ОСТАЮТСЯ ОТКРЫТЫМИ.
Витрина — прозрачная дверь в раме, сквозь неё видны полки и подсветка.
Закрыть её глухим фасадом — ошибка. Открытая ниша остаётся без дверцы.

СОСТАВ НЕ ДОПОЛНЯЕТСЯ.
Модулей ровно ${moduleCount}. Не добавлять шкафы, полки, ниши и приборы,
которых нет в списке выше. Не убирать те, что есть.`;
}

/** Чего ждём от промпта: по модулю в каждом ряду. */
export type CompositionExpect = {
  /** Нижний ряд: `run.modules`. */
  baseCount: number;
  /** Верхний ряд: сумма модулей по всем `run.upperSegments`. */
  upperCount: number;
  /** Сколько ящичных фронтов в составе — по обоим рядам. */
  drawerFronts: number;
};

/**
 * Сверка состава перед отправкой.
 *
 * Число описанных модулей обязано совпасть с рядом — С КАЖДЫМ ОТДЕЛЬНО.
 * Считать всё подряд нельзя: промпт описывает два ряда, и сумма не сходится
 * ни с одним из них. Ошибка называет ряд поимённо, иначе на неё смотрят и
 * не понимают, где искать.
 *
 * Расхождение — исключение на сборке запроса, а не сюрприз на картинке:
 * рендер стоит денег, а неверная картинка стоит доверия.
 */
export function assertCompositionMatches(prompt: string, expect: CompositionExpect): void {
  const rows = countFrontRows(prompt);

  if (rows.base !== expect.baseCount) {
    throw new Error(
      `Нижний ряд: в промпте описано ${rows.base} модулей, а в ряду ${expect.baseCount} — ` +
        'клиенту нарисовали бы другой гарнитур.',
    );
  }

  if (rows.upper !== expect.upperCount) {
    throw new Error(
      `Верхний ряд: в промпте описано ${rows.upper} модулей, а в ряду ${expect.upperCount} — ` +
        'клиенту нарисовали бы другой гарнитур.',
    );
  }

  const drawerRows = prompt
    .split('\n')
    .filter((line) => FRONT_ROW.test(line) && /ЯЩИК/i.test(line)).length;

  if (drawerRows === 0 && expect.drawerFronts > 0) {
    throw new Error(
      'В составе есть ящики, а в промпте о них не сказано ни слова — ' +
        'модель нарисует сплошные дверцы.',
    );
  }
}
