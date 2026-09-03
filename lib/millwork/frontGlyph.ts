import { currentVariant } from './moduleVariants';
import type { Module, ModuleVariantKind } from '@/types/millwork';

/**
 * ЧТО ВИДНО НА ФАСАДЕ МОДУЛЯ.
 *
 * Раньше чертёж рисовал варианты «на глаз»: витрина с подсветкой выглядела
 * обычным шкафом, карго — обычной дверцей. Клиент подписывал одно, а в цех
 * уходило другое.
 *
 * Здесь описано ОДНИМ СПИСКОМ, что должно быть нарисовано у каждого модуля:
 * створки, ящики, стекло, полки сквозь стекло, подсветка, решётка сушилки,
 * дуга подъёмника. Чертёж рисует ИМЕННО ЭТОТ список, а приёмка сверяет, что
 * два разных варианта не дают одинаковый рисунок. Икону рисовать нельзя:
 * она разойдётся с чертежом на первой же правке.
 */

export type GlyphElement =
  /** Сплошная створка во всю высоту модуля. */
  | { kind: 'panel' }
  /** Диагонали открывания со сходом на петельной стороне. */
  | { kind: 'swing'; hinge: 'left' | 'right' }
  /** Шов между двумя створками. */
  | { kind: 'split' }
  /** Горизонтальный фронт ящика: со швом сверху и снизу. */
  | { kind: 'drawer'; index: number; count: number }
  /** Незакрашенное поле стекла: заливка на печати схлопывается в плашку. */
  | { kind: 'glass' }
  /** Рама витрины по периметру. */
  | { kind: 'frame' }
  /** Полки, видные сквозь стекло или в открытой секции. */
  | { kind: 'shelf'; count: number }
  /** Волна подсветки по контуру. */
  | { kind: 'led' }
  /** Открытая секция: фасада нет вовсе. */
  | { kind: 'open' }
  /** Вертикальная стрелка выдвижения — карго. */
  | { kind: 'cargo' }
  /** Решётка сушилки пунктиром. */
  | { kind: 'dryer' }
  /** Дуга подъёмника со стрелкой вверх. */
  | { kind: 'lift' }
  /** Пунктирный вырез чаши мойки сверху. */
  | { kind: 'sinkCut' }
  /** Полоса варочной панели над укороченным ящиком. */
  | { kind: 'hobStrip' }
  /** Воздуховод вытяжки пунктиром вверх. */
  | { kind: 'hoodDuct' }
  /** Тёмные врезки приборов колонны. */
  | { kind: 'niche'; count: number }
  /** Штанга поперёк секции. */
  | { kind: 'rod' };

export type GlyphMode = 'fronts' | 'inside';

/** Подпись набора: по ней приёмка сверяет, что варианты различимы. */
export function glyphSignature(elements: GlyphElement[]): string {
  return elements
    .map((el) => {
      if (el.kind === 'drawer') return `drawer:${el.index}/${el.count}`;
      if (el.kind === 'shelf') return `shelf:${el.count}`;
      if (el.kind === 'niche') return `niche:${el.count}`;
      if (el.kind === 'swing') return `swing:${el.hinge}`;
      return el.kind;
    })
    .join('|');
}

/** Сколько полок видно у варианта — число берётся из наполнения модуля. */
function shelfCount(unit: Module, fallback: number): number {
  const fromFill = unit.fill?.shelves.length ?? 0;
  return fromFill > 0 ? fromFill : fallback;
}

function hinge(unit: Module): 'left' | 'right' {
  return unit.fill?.hinge === 'right' ? 'right' : 'left';
}

/**
 * Что рисуется на фасаде модуля.
 *
 * `fronts` — вид для клиента: створки, ящики, стекло. `inside` — разрез:
 * фасады сняты, но НАПОЛНЕНИЕ остаётся. У витрины там полки, у карго —
 * корзины, у сушилки — решётка: иначе разрез не отличает один вариант
 * от другого, а отличаются они именно начинкой.
 */
export function frontGlyph(unit: Module, mode: GlyphMode = 'fronts'): GlyphElement[] {
  const variant: ModuleVariantKind = currentVariant(unit);
  const elements: GlyphElement[] = [];

  const drawers = (count: number) => {
    for (let i = 0; i < count; i += 1) elements.push({ kind: 'drawer', index: i, count });
  };

  switch (variant) {
    /* ── Нижний ряд ── */
    case 'door':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        if (unit.doorCount >= 2) {
          elements.push({ kind: 'split' });
          elements.push({ kind: 'swing', hinge: 'left' });
          elements.push({ kind: 'swing', hinge: 'right' });
        } else {
          elements.push({ kind: 'swing', hinge: hinge(unit) });
        }
      } else {
        elements.push({ kind: 'shelf', count: shelfCount(unit, 1) });
      }
      break;

    case 'door_two':
      // Две створки: шов посередине и свои диагонали на каждой.
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        elements.push({ kind: 'split' });
        elements.push({ kind: 'swing', hinge: 'left' });
        elements.push({ kind: 'swing', hinge: 'right' });
      } else {
        elements.push({ kind: 'shelf', count: shelfCount(unit, 2) });
      }
      break;

    case 'drawers_four':
      if (mode === 'fronts') drawers(4);
      else {
        elements.push({ kind: 'drawer', index: 0, count: 4 });
        elements.push({ kind: 'shelf', count: 3 });
      }
      break;

    case 'drawers':
      if (mode === 'fronts') drawers(Math.max(2, unit.drawerCount || 3));
      else elements.push({ kind: 'drawer', index: 0, count: Math.max(2, unit.drawerCount || 3) });
      break;

    case 'drawers_door':
      // Верхний ящик, ниже сплошная створка: так это и делают в цеху.
      if (mode === 'fronts') {
        elements.push({ kind: 'drawer', index: 0, count: 1 });
        elements.push({ kind: 'panel' });
        elements.push({ kind: 'swing', hinge: hinge(unit) });
      } else {
        elements.push({ kind: 'drawer', index: 0, count: 1 });
        elements.push({ kind: 'shelf', count: shelfCount(unit, 1) });
      }
      break;

    case 'cargo':
      // Узкий выдвижной фасад: вертикальная стрелка выдвижения.
      elements.push({ kind: 'panel' });
      elements.push({ kind: 'cargo' });
      if (mode === 'inside') elements.push({ kind: 'shelf', count: 3 });
      break;

    case 'sink_base':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        elements.push({ kind: 'swing', hinge: hinge(unit) });
      }
      // Пунктирная чаша сверху — по ней видно, что дна у модуля нет.
      elements.push({ kind: 'sinkCut' });
      break;

    case 'hob_base':
      if (mode === 'fronts') drawers(2);
      elements.push({ kind: 'hobStrip' });
      break;

    case 'corner_carousel':
      elements.push({ kind: 'panel' });
      elements.push({ kind: 'swing', hinge: hinge(unit) });
      elements.push({ kind: 'shelf', count: 2 });
      break;

    case 'open_base':
      elements.push({ kind: 'open' });
      elements.push({ kind: 'shelf', count: shelfCount(unit, 2) });
      break;

    /* ── Верхний ряд ── */
    case 'upper_door':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        if (unit.doorCount >= 2) elements.push({ kind: 'split' });
        elements.push({ kind: 'swing', hinge: hinge(unit) });
      } else {
        elements.push({ kind: 'shelf', count: shelfCount(unit, 1) });
      }
      break;

    case 'upper_glass':
      /*
       * ВИТРИНА: стекло — не заливка, а незакрашенное поле с рамой.
       * Сплошная плашка на чёрно-белой печати схлопывается, и витрина
       * становится обычным шкафом.
       */
      elements.push({ kind: 'frame' });
      if (mode === 'fronts') elements.push({ kind: 'glass' });
      elements.push({ kind: 'shelf', count: shelfCount(unit, 2) });
      elements.push({ kind: 'led' });
      break;

    case 'upper_display':
      /*
       * Витрина с подсветкой отличается от «стекла в раме» именно
       * подсветкой и стеклянными полками: это другие деньги в смете,
       * значит и рисунок обязан быть другим.
       */
      elements.push({ kind: 'frame' });
      if (mode === 'fronts') elements.push({ kind: 'glass' });
      elements.push({ kind: 'shelf', count: shelfCount(unit, 3) });
      elements.push({ kind: 'led' });
      elements.push({ kind: 'open' });
      break;

    case 'upper_micro':
      // Ниша под микроволновку: открытый проём и полка под прибор.
      elements.push({ kind: 'open' });
      elements.push({ kind: 'niche', count: 1 });
      break;

    case 'upper_dryer':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        elements.push({ kind: 'swing', hinge: hinge(unit) });
      }
      elements.push({ kind: 'dryer' });
      break;

    case 'upper_lift':
      elements.push({ kind: 'panel' });
      elements.push({ kind: 'lift' });
      if (mode === 'inside') elements.push({ kind: 'shelf', count: shelfCount(unit, 1) });
      break;

    case 'upper_open':
      elements.push({ kind: 'open' });
      elements.push({ kind: 'shelf', count: shelfCount(unit, 2) });
      break;

    /* ── Пеналы ── */
    case 'tall_shelves':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        elements.push({ kind: 'swing', hinge: hinge(unit) });
      }
      elements.push({ kind: 'shelf', count: shelfCount(unit, 4) });
      break;

    case 'tall_oven_micro':
      // Колонна: два прибора один над другим, между ними полка.
      if (mode === 'fronts') elements.push({ kind: 'panel' });
      elements.push({ kind: 'niche', count: 2 });
      elements.push({ kind: 'shelf', count: 1 });
      break;

    case 'tall_fridge':
      // Встроенный холодильник: сплошной фасад заподлицо и одна врезка.
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        elements.push({ kind: 'swing', hinge: hinge(unit) });
      }
      elements.push({ kind: 'niche', count: 1 });
      break;

    case 'tall_display':
      elements.push({ kind: 'frame' });
      if (mode === 'fronts') elements.push({ kind: 'glass' });
      elements.push({ kind: 'shelf', count: shelfCount(unit, 4) });
      elements.push({ kind: 'led' });
      break;

    case 'tall_cargo':
      elements.push({ kind: 'panel' });
      elements.push({ kind: 'cargo' });
      elements.push({ kind: 'shelf', count: 5 });
      break;

    case 'tall_rod':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        elements.push({ kind: 'swing', hinge: hinge(unit) });
      }
      elements.push({ kind: 'rod' });
      break;
  }

  /*
   * Колонна рисуется поверх варианта: два тёмных проёма на своих высотах.
   * Их считает `columnNiches` — та же функция, что строит 3D и наполнение,
   * здесь нужно только их число.
   */
  if (unit.column && !elements.some((el) => el.kind === 'niche')) {
    const count = [unit.column.top, unit.column.bottom].filter(Boolean).length;
    elements.push({ kind: 'niche', count });
  }

  // Вытяжка: воздуховод пунктиром вверх — по нему видно, куда идёт труба.
  if (unit.appliance === 'hood') elements.push({ kind: 'hoodDuct' });

  return elements;
}
