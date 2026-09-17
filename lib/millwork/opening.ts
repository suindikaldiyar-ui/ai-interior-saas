import { BUILT_IN_FRIDGE_FRONTS, CORNER, hingesPerDoor, isUpperRow } from './modules';
import { MODULE_VARIANTS } from './moduleVariants';
import type { FrontOpening, HandleKind, Module, Run } from '@/types/millwork';

/**
 * НАПРАВЛЕНИЕ ОТКРЫВАНИЯ — ОДНО МЕСТО НА ВЕСЬ ПРОДУКТ.
 *
 * До этого файла направление жило в двух разных представлениях. В данных
 * лежала сторона петель (`fill.hinge`), а фурнитуру смета выводила из
 * РЯДА: «верхний — значит подъёмник, нижний — значит петли». Второе не
 * следует из первого никак, и расходились они молча: клиент выбирал
 * обычный распашной верх, а в смете стояли три газлифта по 7 800 ₸ при
 * петле в 900 ₸.
 *
 * Здесь направление считается ОДИН раз и из данных, а чертёж, сцена,
 * раскрой и смета спрашивают ответ. Не выбрано — умолчание по типу
 * модуля, и оно названо словами, а не подставлено молча.
 */

export const OPENING_TITLE: Record<FrontOpening, string> = {
  left: 'Влево',
  right: 'Вправо',
  lift: 'Вверх (подъёмник)',
  flap: 'Вниз (откидной)',
  double: 'Две створки',
  none: 'Без фасада',
};

/** Что это значит для цеха: одна строка, которую замерщик пересказывает клиенту. */
export const OPENING_HINT: Record<FrontOpening, string> = {
  left: 'петли слева, фасад открывается налево',
  right: 'петли справа, фасад открывается направо',
  lift: 'газлифт: фасад уходит вверх и не мешает голове',
  flap: 'откидной вниз: за ним обычно ниша под технику',
  double: 'две створки от середины',
  none: 'распашного фасада нет',
};

/**
 * Что открывается механизмом, а что петлями.
 *
 * Разница не косметическая: механизм — это отдельная строка сметы и в
 * разы другие деньги.
 */
export function isMechanism(opening: FrontOpening): boolean {
  return opening === 'lift' || opening === 'flap';
}

/** Распашной фасад: петли и сторона присадки. */
/** Фасад выдвигается, а не открывается: карго и высокое карго. */
export function isPullOut(unit: Module): boolean {
  return Boolean(unit.variant && MODULE_VARIANTS[unit.variant].pullOut);
}

export function isSwing(opening: FrontOpening): boolean {
  return opening === 'left' || opening === 'right' || opening === 'double';
}

/**
 * УМОЛЧАНИЕ ПО ТИПУ МОДУЛЯ.
 *
 * Верхний шкаф по умолчанию РАСПАШНОЙ. Это главное изменение слоя:
 * подъёмник ставят осознанно и ради широкого фасада, а не потому, что
 * модуль оказался наверху. Сторона чередуется, чтобы соседние двери не
 * бились друг о друга.
 */
export function defaultOpening(unit: Module, index = 0, total = 1): FrontOpening {
  if (unit.frontType !== 'door') return 'none';

  /*
   * Вариант места «Подъёмник» — это и есть выбор направления: другого
   * признака у него нет. Правило стоит здесь, а не в наполнении, потому
   * что спрашивают его и там, где наполнение ещё не посчитано — на
   * миниатюре варианта в ленте, например.
   */
  if (unit.variant === 'upper_lift') return 'lift';

  /*
   * Карго не открывается — оно выдвигается. Петель у него нет, и
   * направления тоже: фасад едет вперёд вместе с корзинами.
   */
  if (isPullOut(unit)) return 'none';
  if (unit.doorCount >= 2) return 'double';

  const fromLeft = index < total / 2;
  return (fromLeft ? index % 2 === 0 : index % 2 !== 0) ? 'left' : 'right';
}

/** Основание умолчания — словами, для сметы и предупреждений. */
export function defaultOpeningBasis(unit: Module): string {
  if (unit.doorCount >= 2) return 'две створки от середины';
  return isUpperRow(unit)
    ? 'верхний шкаф считается распашным на петлях: подъёмник — выбор, а не умолчание'
    : 'нижний шкаф распашной';
}

export type ResolvedOpening = {
  opening: FrontOpening;
  /** Направление не выбирали — это умолчание по типу модуля. */
  assumed: boolean;
  /** Откуда взялось умолчание. Пусто, если направление выбрано. */
  basis: string;
};

/**
 * НАПРАВЛЕНИЕ ЭТОГО МОДУЛЯ.
 *
 * Спрашивают все: 3D — вокруг чего вращать фасад, чертёж — куда смотрит
 * диагональ, смета — какую фурнитуру считать. Один ответ на всех.
 */
export function openingOf(unit: Module, index = 0, total = 1): ResolvedOpening {
  const stored = unit.fill?.hinge;
  const chosen = Boolean(unit.fill?.openingChosen);

  if (stored && stored !== 'none' && chosen) {
    return { opening: stored, assumed: false, basis: '' };
  }

  /*
   * Наполнение уже посчитано, но выбора человека за ним не стояло:
   * значит это умолчание, и говорить о нём надо как об умолчании. Само
   * значение при этом берём из наполнения — цех сверлит по нему, и
   * второй раз выводить сторону здесь было бы той же ошибкой.
   */
  const value = stored && stored !== 'none' ? stored : defaultOpening(unit, index, total);
  return {
    opening: value,
    assumed: value !== 'none',
    basis: value === 'none' ? '' : defaultOpeningBasis(unit),
  };
}

/**
 * ПОЧЕМУ ТАК НЕЛЬЗЯ.
 *
 * Отказ объясняет МИР, а не запрещает: эту фразу замерщик пересказывает
 * клиенту слово в слово. `null` — можно.
 */
export function openingRejection(unit: Module, opening: FrontOpening): string | null {
  const name = unit.label || 'модуль';

  if (isPullOut(unit)) {
    return `«${name}» выдвигается целиком на направляющих: петель у него нет, и открывать его некуда.`;
  }

  if (unit.frontType !== 'door') {
    return unit.frontType === 'drawers'
      ? `«${name}» — ящики: они выдвигаются, а не открываются. Направление выбирают у распашного фасада.`
      : `У «${name}» распашного фасада нет: выбирать направление не у чего.`;
  }

  if (isMechanism(opening) && !isUpperRow(unit)) {
    return opening === 'lift'
      ? `Подъёмник ставят на верхний ряд и антресоль. У нижнего шкафа фасад пойдёт вверх и упрётся в столешницу, а открытым перекроет рабочее место.`
      : `Откидной фасад ставят на верхний ряд и антресоль. Внизу он открывается человеку на ноги, и подойти к шкафу становится нельзя.`;
  }

  if (opening === 'double' && unit.doorCount < 2) {
    return `У «${name}» одна створка ${unit.widthMm} мм. Две створки — это вариант места «Две дверцы»: там пересчитывается ширина каждой.`;
  }

  if ((opening === 'left' || opening === 'right') && unit.doorCount >= 2) {
    return `У «${name}» две створки: левая на левой петле, правая на правой. Сторону выбирают, когда створка одна.`;
  }

  return null;
}

/**
 * Что предложить в этом месте.
 *
 * Неподходящее не показывается серым: серая кнопка — это вопрос «почему
 * нельзя», а задавать его на встрече с клиентом некому.
 */
export function openingsFor(unit: Module): FrontOpening[] {
  return (['left', 'right', 'lift', 'flap', 'double'] as FrontOpening[]).filter(
    (opening) => openingRejection(unit, opening) === null,
  );
}

/* ─────────────────────────  Ручки  ───────────────────────── */

export const HANDLE_TITLE: Record<HandleKind, string> = {
  bar: 'Скоба',
  profile: 'Профиль',
  none: 'Без ручки',
};

export const HANDLE_HINT: Record<HandleKind, string> = {
  bar: 'накладная ручка-скоба',
  profile: 'врезной профиль по кромке фасада',
  none: 'нажатием: push-to-open, ручки на фасаде нет',
};

/**
 * ЧЕМ ОТКРЫВАЮТ ЭТОТ ФАСАД.
 *
 * Выбор лежит на модуле; пусто — умолчание ряда. Спрашивают одну
 * функцию: сцена рисует по ней ручку, смета считает по ней фурнитуру, и
 * разойтись им негде.
 */
export function handleOf(
  unit: Module,
  run: Pick<Run, 'options'>,
): { handle: HandleKind; assumed: boolean } {
  const chosen = unit.fill?.handle;
  if (chosen) return { handle: chosen, assumed: false };
  return { handle: run.options.integratedHandles ? 'profile' : 'bar', assumed: true };
}

/* ─────────────────────────  Фурнитура  ───────────────────────── */

/**
 * ЧТО СТОИТ ЗА НАПРАВЛЕНИЕМ.
 *
 * | направление | фурнитура |
 * |---|---|
 * | влево/вправо/две створки | петли по высоте полотна |
 * | у углового модуля | петли 175°: обычная упрётся в соседний фасад |
 * | вверх | подъёмник — комплект на фасад, петли в него входят |
 * | вниз | откидной механизм ПЛЮС петли: полотно висит на них снизу |
 *
 * Считается по ВЫБРАННОМУ направлению. Ряд, в котором модуль оказался,
 * на фурнитуру не влияет вовсе — именно это и стоило лишних денег.
 */
export type OpeningHardware = {
  hinges: number;
  /**
   * Ручки по типам: скоб и нажимных механизмов — штуками, профиля —
   * миллиметрами кромки, по которой он режется.
   */
  handleBar: number;
  handleProfileMm: number;
  handlePush: number;
  /** Петли 175° для угловых модулей: фальш-панель и карусель без них не открываются. */
  cornerHinges: number;
  lifts: number;
  flaps: number;
  handles: number;
  /** Модули, у которых направление не выбрано: смета говорит о них словами. */
  assumed: { label: string; opening: FrontOpening; basis: string }[];
  /**
   * ТО ЖЕ САМОЕ, РАЗЛОЖЕННОЕ ПО МОДУЛЯМ.
   *
   * Нужно там, где у модуля выбрана СВОЯ фурнитура из каталога: её цена
   * берётся у позиции, а не у общей ставки ряда, и посчитать штуки
   * отдельно от общего итога нельзя — они разойдутся.
   *
   * Поэтому это не второй счёт, а тот же: числа накапливаются В ТОМ ЖЕ
   * ЦИКЛЕ и теми же прибавками, что и итоги выше. Сумма разреза по
   * модулям равна итогу по построению.
   */
  byModule: Record<string, ModuleHardware>;
};

/** Фурнитура одного модуля: те же величины, что в итоге ряда. */
export type ModuleHardware = {
  hinges: number;
  cornerHinges: number;
  lifts: number;
  flaps: number;
  handleBar: number;
  handleProfileMm: number;
  handlePush: number;
};

export function openingHardware(
  units: { unit: Module; heightMm: number; index?: number; total?: number }[],
  /** Ряд нужен ради умолчания ручки: оно живёт в опциях ряда. */
  run: Pick<Run, 'options'> = { options: {} as Run['options'] },
): OpeningHardware {
  const result: OpeningHardware = {
    hinges: 0,
    handleBar: 0,
    handleProfileMm: 0,
    handlePush: 0,
    cornerHinges: 0,
    lifts: 0,
    flaps: 0,
    handles: 0,
    assumed: [],
    byModule: {},
  };

  /**
   * Разрез по модулям заполняется ТЕМИ ЖЕ прибавками, что и итог: любая
   * правка правила меняет оба числа разом, и разойтись им негде.
   */
  let current: ModuleHardware = {
    hinges: 0,
    cornerHinges: 0,
    lifts: 0,
    flaps: 0,
    handleBar: 0,
    handleProfileMm: 0,
    handlePush: 0,
  };
  const add = (field: keyof ModuleHardware, value: number) => {
    current[field] += value;
    if (field === 'handleProfileMm') result.handleProfileMm += value;
    else if (field === 'handleBar') result.handleBar += value;
    else if (field === 'handlePush') result.handlePush += value;
    else if (field === 'cornerHinges') result.cornerHinges += value;
    else if (field === 'lifts') result.lifts += value;
    else if (field === 'flaps') result.flaps += value;
    else result.hinges += value;
  };

  /** Ручки на фасадах: сколько и какого типа. */
  const addHandles = (unit: Module, fronts: number) => {
    const { handle } = handleOf(unit, run);
    if (handle === 'bar') add('handleBar', fronts);
    else if (handle === 'profile') add('handleProfileMm', unit.widthMm);
    else add('handlePush', fronts);
    result.handles += fronts;
  };

  for (const { unit, heightMm, index = 0, total = 1 } of units) {
    current = {
      hinges: 0,
      cornerHinges: 0,
      lifts: 0,
      flaps: 0,
      handleBar: 0,
      handleProfileMm: 0,
      handlePush: 0,
    };
    result.byModule[unit.id] = current;

    /*
     * ЯЩИКИ И ФАСАДЫ ВСТРОЙКИ — ТОЖЕ ФАСАДЫ.
     *
     * За них тоже берутся рукой: у ящика ручка на каждом фронте, у
     * встроенного холодильника — на каждой створке. Пока ручки считались
     * отдельной строкой по опции ряда, это было незаметно; теперь тип
     * ручки выбирают помодульно, и считать их надо там же, где остальную
     * фурнитуру фасада.
     */
    if (unit.frontType === 'drawers') {
      addHandles(unit, unit.fill?.drawerHeights.length || unit.drawerCount);
    }
    if (unit.builtIn) addHandles(unit, BUILT_IN_FRIDGE_FRONTS);

    if (unit.frontType !== 'door') continue;

    const { opening, assumed, basis } = openingOf(unit, index, total);
    if (opening === 'none') {
      /*
       * Фасад есть, петель нет — это карго. Ручка ему всё равно нужна:
       * за неё выдвигают.
       */
      addHandles(unit, 1);
      continue;
    }

    const doors = Math.max(1, unit.doorCount);
    const isCorner = unit.kind === 'corner_base' || unit.kind === 'corner_upper';

    if (isSwing(opening)) {
      const perDoor = hingesPerDoor(heightMm);
      if (isCorner) add('cornerHinges', doors * perDoor);
      else add('hinges', doors * perDoor);
    }

    if (opening === 'lift') {
      /*
       * Подъёмник ставят на ОДИН фасад: ради широкого фасада он и нужен.
       * Число створок здесь не умножается — модуль с подъёмником имеет
       * одну створку, и операция это обеспечивает.
       */
      add('lifts', 1);
    }

    if (opening === 'flap') {
      add('flaps', 1);
      add('hinges', hingesPerDoor(heightMm));
    }

    /*
     * РУЧКА — РАЗНАЯ ФУРНИТУРА И РАЗНЫЕ ДЕНЬГИ.
     *
     * Скоба считается штуками на фасад, профиль — миллиметрами кромки
     * (он режется по ширине модуля), нажимной механизм — штуками: за
     * «без ручки» стоит механизм, а не пустота.
     */
    addHandles(unit, isMechanism(opening) ? 1 : doors);

    /*
     * О чём молчать нельзя, а о чём не стоит говорить.
     *
     * Умолчание есть у каждого модуля, но деньги оно меняет только там,
     * где механизм ВОЗМОЖЕН: у верхнего фасада подъёмник дороже петли в
     * разы. У нижнего шкафа альтернативы нет вовсе, и «направление не
     * выбрано» было бы там шумом — а шум читают не глядя.
     */
    if (assumed && isSwing(opening) && isUpperRow(unit)) {
      result.assumed.push({ label: unit.label || 'модуль', opening, basis });
    }
  }

  return result;
}

/**
 * Ключ статьи подъёмника: Aventos — это комплект целиком, а газлифт —
 * пружина к обычному фасаду. Класс фурнитуры уже выбран человеком, и
 * второй раз спрашивать его незачем.
 */
export function liftKey(hardwareClass: Run['options']['hardwareClass']): string {
  return hardwareClass === 'blum' ? 'lift_aventos' : 'lift_mechanism';
}

/** Угол раскрытия угловой петли — тот же, что держит стык рядов. */
export const CORNER_HINGE_TITLE = `Петля угловая ${CORNER.hingeAngleDeg}°`;
