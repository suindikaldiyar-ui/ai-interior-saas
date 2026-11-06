import {
  MODULE_VARIANTS,
  applyVariant,
  variantsForModule,
  currentVariant,
} from './moduleVariants';
import { gripOnEvery, handleOf, openingOf } from './opening';
import { schemeLeaves } from './frontSwatch';
import { drawerSplitOf } from './drawerGrid';
import { fillShelfCount } from './bays';
import { handleSpotOf, type HandleSpot } from './handlePlace';
import { vitrineDoorCount, vitrineOf } from './vitrine';
import { facadeSpans, frontSplitSpans } from './applianceFront';
import { hasFrontZones, zoneAt, zoneDoors } from './frontZones';
import type { FrontZoneFill, Module, ModuleVariantKind, Run } from '@/types/millwork';

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
  /**
   * Диагонали открывания со сходом на петельной стороне. `band` — участок фасада, разделённого по высоте
   * (доли высоты модуля от низа): у каждой части свои диагонали.
   */
  | { kind: 'swing'; hinge: 'left' | 'right'; band?: [number, number] }
  /** Горизонтальные швы фасада, разделённого по высоте (P1/P2): доли высоты модуля от низа. */
  | { kind: 'hseam'; shares: number[] }
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
  /* `leftShare` — ряд разделён на два столбца (A4): ось перегородки долей ширины модуля. */
  | { kind: 'drawer'; index: number; count: number; heights?: number[]; leftShare?: number }
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
  | { kind: 'rod' }
  /** Зона фасада по высоте: доли от низа модуля и что в ней (`frontZones`). */
  | { kind: 'zone'; from: number; to: number; fill: FrontZoneFill; doors: number; drawers: number };

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
      if (el.kind === 'zone') return `zone:${el.fill}:${el.doors}`;
      return el.kind;
    })
    .join('|');
}

/** Сколько полок видно у варианта — число берётся из наполнения модуля. */
function shelfCount(unit: Module, fallback: number): number {
  /* С отсеками (R01) — все полки модуля по отсекам, тем же счётом, что раскрой. */
  const fromFill = fillShelfCount(unit.fill);
  return fromFill > 0 ? fromFill : fallback;
}

/**
 * ОТКРЫВАНИЕ РИСУЕТСЯ ИЗ ТОГО ЖЕ ПОЛЯ, ПО КОТОРОМУ СЧИТАЕТСЯ ФУРНИТУРА.
 *
 * Диагональ на чертеже — это указание цеху, с какой стороны сверлить, а
 * дуга — какой механизм заказать. Выведи их отдельной формулой, и лист
 * начнёт обещать одно, а смета оплачивать другое.
 */
function pushOpening(unit: Module, elements: GlyphElement[], heightMm?: number): void {
  const { opening } = openingOf(unit);
  /* Фасад разделён по высоте (P1/P2): швы и диагонали у каждой части — те же участки, что у раскроя и сцены. */
  const split = heightMm ? frontSplitSpans(unit, heightMm) : null;
  if (split && (opening === 'left' || opening === 'right')) {
    elements.push({ kind: 'hseam', shares: split.slice(1).map((span) => span.fromMm / heightMm!) });
    for (const span of split) {
      elements.push({ kind: 'swing', hinge: opening, band: [span.fromMm / heightMm!, (span.fromMm + span.heightMm) / heightMm!] });
    }
    return;
  }

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
 * РИСУНОК ВИТРИНЫ (P1): рамка и стекло (незакрашенное поле, а не заливка —
 * на чёрно-белой печати витрина иначе становится шкафом), диагонали петель
 * у каждой двери, полки и ленту — только если лента есть в изделии.
 *
 * До P1 у «Стекла в раме» рисовалась подсветка, которой в смете не было
 * (у варианта нет статьи ленты), а сторона петель витрины на листе не
 * показывалась вовсе. Секция-витрина хранит дверь не створкой — сторона
 * её петель та же, что у сцены (`doorOpening`: не выбрана — слева).
 */
function vitrineGlyph(unit: Module, vitrine: NonNullable<ReturnType<typeof vitrineOf>>, variant: ModuleVariantKind, mode: GlyphMode): GlyphElement[] {
  const elements: GlyphElement[] = [{ kind: 'frame' }];
  if (mode === 'fronts') {
    elements.push({ kind: 'glass' });
    const doors = vitrineDoorCount(unit);
    const { opening } = openingOf(unit);
    if (doors >= 2 || opening === 'double') {
      elements.push({ kind: 'split' }, { kind: 'swing', hinge: 'left' }, { kind: 'swing', hinge: 'right' });
    } else if (doors === 1) {
      elements.push({ kind: 'swing', hinge: opening === 'right' ? 'right' : 'left' });
    }
  }
  const fallback = variant === 'tall_display' ? 4 : variant === 'upper_display' ? 3 : 2;
  elements.push({ kind: 'shelf', count: shelfCount(unit, fallback) });
  if (vitrine.led !== 'off') elements.push({ kind: 'led' });
  /* «Витрина с подсветкой» и на листе отличается от «Стекла в раме» не только лентой — как до P1. */
  if (variant === 'upper_display') elements.push({ kind: 'open' });
  /* Ручка двери витрины — та же, что у сцены и сметы: на свободной кромке, «Без ручки» — нет. */
  if (mode === 'fronts') pushHandle(unit, elements);
  return elements;
}

/**
 * Что рисуется на фасаде модуля.
 *
 * `fronts` — вид для клиента: створки, ящики, стекло. `inside` — разрез:
 * фасады сняты, но НАПОЛНЕНИЕ остаётся. У витрины там полки, у карго —
 * корзины, у сушилки — решётка: иначе разрез не отличает один вариант
 * от другого, а отличаются они именно начинкой.
 */
export function frontGlyph(unit: Module, mode: GlyphMode = 'fronts', heightMm?: number): GlyphElement[] {
  const variant: ModuleVariantKind = currentVariant(unit);
  const elements: GlyphElement[] = [];

  /*
   * ЗОНЫ ФАСАДА (задачи 2–4): участки те же, что у раскроя и сцены, в долях высоты. Без высоты (лента превью) — поровну.
   */
  if (hasFrontZones(unit)) {
    const fullMm = heightMm ?? 1000;
    const spans = heightMm ? facadeSpans(unit, heightMm) : (unit.frontZones ?? []).map((_, i, all) => ({ fromMm: (fullMm * i) / all.length, heightMm: fullMm / all.length }));
    spans.forEach((span, i) => {
      const zone = zoneAt(unit, i);
      elements.push({
        kind: 'zone',
        from: span.fromMm / fullMm,
        to: (span.fromMm + span.heightMm) / fullMm,
        fill: zone.fill,
        doors: zoneDoors(zone),
        drawers: zone.fill === 'drawers' ? (unit.fill?.drawerHeights.length ?? 1) : 0,
      });
    });
    if (unit.column && !elements.some((el) => el.kind === 'niche')) {
      elements.push({ kind: 'niche', count: [unit.column.top, unit.column.bottom].filter(Boolean).length });
    }
    if (mode === 'fronts') pushHandle(unit, elements);
    return elements;
  }

  /* Витрина (P1) — одним рисунком по `vitrineOf`, какой бы вариант и секция её ни дали. */
  const vitrine = vitrineOf(unit);
  if (vitrine) return vitrineGlyph(unit, vitrine, variant, mode);

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
    const split = drawerSplitOf(unit.fill, unit.widthMm);
    for (let i = 0; i < count; i += 1) {
      elements.push({
        kind: 'drawer',
        index: i,
        count,
        heights: heights.length === count ? heights : undefined,
        ...(split && i < split.rows && heights.length === count ? { leftShare: split.leftMm / unit.widthMm } : {}),
      });
    }
  };

  switch (variant) {
    /* ── Нижний ряд ── */
    case 'door':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        pushOpening(unit, elements, heightMm);
      } else {
        elements.push({ kind: 'shelf', count: shelfCount(unit, 1) });
      }
      break;

    case 'door_two':
      // Две створки: шов посередине и свои диагонали на каждой.
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        pushOpening(unit, elements, heightMm);
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
        pushOpening(unit, elements, heightMm);
      } else {
        elements.push({ kind: 'drawer', index: 0, count: 1 });
        elements.push({ kind: 'shelf', count: shelfCount(unit, 1) });
      }
      break;

    case 'base_dryer':
      // Нижняя сушка (фаза 1): выдвижной фасад и решётка корзины за ним.
      elements.push({ kind: 'panel' });
      elements.push({ kind: 'cargo' });
      elements.push({ kind: 'dryer' });
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
        pushOpening(unit, elements, heightMm);
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
      pushOpening(unit, elements, heightMm);
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
        pushOpening(unit, elements, heightMm);
      } else {
        elements.push({ kind: 'shelf', count: shelfCount(unit, 1) });
      }
      break;

    /* «Стекло в раме» и «Витрина с подсветкой» — витрины: рисует их `vitrineGlyph` выше (P1). */

    case 'upper_micro':
      // Ниша под микроволновку: открытый проём и полка под прибор.
      elements.push({ kind: 'open' });
      elements.push({ kind: 'niche', count: 1 });
      break;

    case 'upper_dryer':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        pushOpening(unit, elements, heightMm);
      }
      elements.push({ kind: 'dryer' });
      break;

    case 'upper_lift':
      elements.push({ kind: 'panel' });
      /*
       * Дугу рисует то же поле, что и у остальных: вариант «Подъёмник»
       * пишет направление в `fill`, и второго признака у него нет.
       */
      pushOpening(unit, elements, heightMm);
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
        pushOpening(unit, elements, heightMm);
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
        pushOpening(unit, elements, heightMm);
      }
      elements.push({ kind: 'niche', count: 1 });
      break;

    /* «Витрина» во всю высоту — тоже `vitrineGlyph` (P1). */

    case 'tall_cargo':
      elements.push({ kind: 'panel' });
      elements.push({ kind: 'cargo' });
      elements.push({ kind: 'shelf', count: 5 });
      break;

    case 'tall_rod':
      if (mode === 'fronts') {
        elements.push({ kind: 'panel' });
        pushOpening(unit, elements, heightMm);
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
  if (mode === 'fronts') pushHandle(unit, elements);

  return elements;
}

/** Ручка на рисунке фасада — одна для обычного модуля и витрины (P1). */
function pushHandle(unit: Module, elements: GlyphElement[]): void {
  const run = { options: {} as Run['options'] };
  const handle = handleOf(unit, run);
  const fronts = elements.some(
    (el) => el.kind === 'panel' || el.kind === 'drawer' || el.kind === 'glass' || (el.kind === 'zone' && el.doors + el.drawers > 0),
  );

  /* Ручка фрезерована во всех фасадах модуля (KIRA «Интегрированные ручки», `milledGrip`) — значка ручки нет. */
  const milled = gripOnEvery(unit, schemeLeaves(unit).map((place) => place.leaf));
  if (fronts && handle.handle !== 'none' && !milled) {
    elements.push({ kind: 'handle', spot: handleSpotOf(unit, run) });
  }
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
