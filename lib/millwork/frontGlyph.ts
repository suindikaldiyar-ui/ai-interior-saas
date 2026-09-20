import {
  MODULE_VARIANTS,
  applyVariant,
  variantsForModule,
  currentVariant,
} from './moduleVariants';
import { handleOf, openingOf } from './opening';
import { handleSpotOf, type HandleSpot } from './handlePlace';
import type { Module, ModuleVariantKind, Run } from '@/types/millwork';

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
  /**
   * Горизонтальный фронт ящика: со швом сверху и снизу.
   *
   * `heights` — высоты ВСЕХ фронтов модуля, мм, сверху вниз: те самые,
   * по которым режется раскрой. Без них рисунок делил модуль поровну, и
   * два ящика 140 + 580 выходили на чертеже как 360 + 360 — клиент видел
   * мебель, которой цех не сделает.
   *
   * Пусто — модуля ещё нет (превью варианта в ленте), и доли равные.
   */
  | { kind: 'drawer'; index: number; count: number; heights?: number[] }
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
  /**
   * РУЧКА НА ФАСАДЕ — В ТОМ ЖЕ ПОЛОЖЕНИИ, ЧТО В СЦЕНЕ.
   *
   * Лист рисовал мебель без единой ручки: положение выбиралось и до
   * чертежа не доезжало вовсе. Сборщик по такому листу не знает, с какой
   * стороны за фасад берутся, а это вопрос, который решают на объекте.
   *
   * `place` — то же поле `fill.handlePlace`, по которому ручку ставит
   * сцена. Второго правила «где ручка» в продукте нет.
   */
  | { kind: 'handle'; spot: HandleSpot }
  /** Вертикальная стрелка выдвижения — карго. */
  | { kind: 'cargo' }
  /** Решётка сушилки пунктиром. */
  | { kind: 'dryer' }
  /** Дуга подъёмника со стрелкой вверх. */
  | { kind: 'lift' }
  /** Дуга откидного фасада со стрелкой вниз. */
  | { kind: 'flap' }
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
      if (el.kind === 'drawer') {
        return `drawer:${el.index}/${el.count}${el.heights ? `:${el.heights.join('+')}` : ''}`;
      }
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

/**
 * ОТКРЫВАНИЕ РИСУЕТСЯ ИЗ ТОГО ЖЕ ПОЛЯ, ПО КОТОРОМУ СЧИТАЕТСЯ ФУРНИТУРА.
 *
 * Диагональ на чертеже — это указание цеху, с какой стороны сверлить, а
 * дуга — какой механизм заказать. Выведи их отдельной формулой, и лист
 * начнёт обещать одно, а смета оплачивать другое.
 */
function pushOpening(unit: Module, elements: GlyphElement[]): void {
  const { opening } = openingOf(unit);

  if (opening === 'lift') {
    elements.push({ kind: 'lift' });
    return;
  }
  if (opening === 'flap') {
    elements.push({ kind: 'flap' });
    return;
  }
  if (opening === 'double') {
    elements.push({ kind: 'split' });
    elements.push({ kind: 'swing', hinge: 'left' });
    elements.push({ kind: 'swing', hinge: 'right' });
    return;
  }
  if (opening === 'left' || opening === 'right') {
    elements.push({ kind: 'swing', hinge: opening });
  }
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

  /**
   * СКОЛЬКО ФРОНТОВ РИСОВАТЬ — ТА ЖЕ ВЕЛИЧИНА, ЧТО В РАСКРОЕ.
   *
   * Наполнение (`fill.drawerHeights`) — единственный ответ: по нему
   * режутся фронты и по нему же считаются направляющие. Здесь стояло
   * своё число — `Math.max(2, unit.drawerCount || 3)`, — и один ящик
   * рисовался двумя.
   *
   * Модуля ещё нет — наполнения тоже (лента превью строит модуль через
   * `applyVariant`, а он снимает `fill`). Тогда берём число, ОБЪЯВЛЕННОЕ
   * САМИМ ВАРИАНТОМ: из него же `defaultFill` и построит высоты, когда
   * модуль появится. Третьего числа не заводим.
   */
  const declared = MODULE_VARIANTS[variant]?.drawerCount ?? 0;
  const heights = unit.fill?.drawerHeights ?? [];
  const frontCount = heights.length > 0 ? heights.length : declared;

  const drawers = (count = frontCount) => {
    /*
     * Фронтов нет и вариант их не объявляет — не рисуем ничего.
     * Выдуманный ящик на чертеже клиент примет за факт, а в раскрое его
     * нет: пустое поле модуля честнее придуманного.
     */
    for (let i = 0; i < count; i += 1) {
      elements.push({
        kind: 'drawer',
        index: i,
        count,
        heights: heights.length === count ? heights : undefined,
      });
    }
  };

  switch (variant) {
    /* ── Нижний ряд ── */
    case 'door':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        pushOpening(unit, elements);
      } else {
        elements.push({ kind: 'shelf', count: shelfCount(unit, 1) });
      }
      break;

    case 'door_two':
      // Две створки: шов посередине и свои диагонали на каждой.
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        pushOpening(unit, elements);
      } else {
        elements.push({ kind: 'shelf', count: shelfCount(unit, 2) });
      }
      break;

    case 'drawers_four':
      if (mode === 'fronts') drawers();
      else {
        if (frontCount > 0) elements.push({ kind: 'drawer', index: 0, count: frontCount });
        elements.push({ kind: 'shelf', count: 3 });
      }
      break;

    case 'drawers':
      if (mode === 'fronts') drawers();
      else if (frontCount > 0) {
        elements.push({ kind: 'drawer', index: 0, count: frontCount });
      }
      break;

    case 'drawers_door':
      // Верхний ящик, ниже сплошная створка: так это и делают в цеху.
      if (mode === 'fronts') {
        elements.push({ kind: 'drawer', index: 0, count: 1 });
        elements.push({ kind: 'panel' });
        pushOpening(unit, elements);
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
        pushOpening(unit, elements);
      }
      // Пунктирная чаша сверху — по ней видно, что дна у модуля нет.
      elements.push({ kind: 'sinkCut' });
      break;

    case 'hob_base':
      /*
       * Под варочной фронты те же, что в раскрое: верхний укорочен под
       * панель. Числа «2» здесь больше нет — его объявляет вариант, а
       * высоты приходят из наполнения.
       */
      if (mode === 'fronts') drawers();
      elements.push({ kind: 'hobStrip' });
      break;

    case 'corner_carousel':
      elements.push({ kind: 'panel' });
      pushOpening(unit, elements);
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
        pushOpening(unit, elements);
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
        pushOpening(unit, elements);
      }
      elements.push({ kind: 'dryer' });
      break;

    case 'upper_lift':
      elements.push({ kind: 'panel' });
      /*
       * Дугу рисует то же поле, что и у остальных: вариант «Подъёмник»
       * пишет направление в `fill`, и второго признака у него нет.
       */
      pushOpening(unit, elements);
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
        pushOpening(unit, elements);
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
        pushOpening(unit, elements);
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
        pushOpening(unit, elements);
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

  /*
   * РУЧКА РИСУЕТСЯ ТАМ, ГДЕ ОНА ЕСТЬ.
   *
   * «Без ручки» — это механизм нажатия, и на фасаде не видно ничего:
   * именно за этим её и выбирают. У открытой секции и у видимого прибора
   * фасада нет вовсе — брать не за что.
   */
  if (mode === 'fronts') {
    const run = { options: {} as Run['options'] };
    const handle = handleOf(unit, run);
    const fronts = elements.some(
      (el) => el.kind === 'panel' || el.kind === 'drawer' || el.kind === 'glass',
    );

    if (fronts && handle.handle !== 'none') {
      elements.push({ kind: 'handle', spot: handleSpotOf(unit, run) });
    }
  }

  return elements;
}


/* ────────────────  Видимый выбор  ──────────────── */

/**
 * СКОЛЬКО РАЗНЫХ РИСУНКОВ ФАСАДА даёт этот модуль.
 *
 * Число вариантов само по себе ничего не значит для встречи: «две дверцы»
 * на модуле 1200 мм рисуются тем же, чем обычная дверца — раскладка и так
 * делает две створки шире 600 мм. Клиент выбирает ГЛАЗАМИ, и считать надо
 * то, что видно.
 *
 * По этому числу приёмка держит демо-объект: если в нём не останется
 * модулей с видимым выбором, главный ход демонстрации — нажать на модуль
 * и поменять его на витрину — молча перестанет работать. Ровно так это
 * однажды и случилось.
 */
export function visibleVariantCount(
  unit: Module,
  run: Parameters<typeof variantsForModule>[1],
  zone: Parameters<typeof variantsForModule>[2],
): number {
  const specs = variantsForModule(unit, run, zone);
  if (specs.length < 2) return 0;

  const drawings = new Set(
    specs.map((spec) => glyphSignature(frontGlyph(applyVariant(unit, spec.kind), 'fronts'))),
  );
  return drawings.size;
}
