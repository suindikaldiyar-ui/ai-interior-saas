import { CORNER, hingesPerDoor, isUpperRow } from './modules';
import { MODULE_VARIANTS } from './moduleVariants';
import type { FrontOpening, Module, Run } from '@/types/millwork';

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
  /** Петли 175° для угловых модулей: фальш-панель и карусель без них не открываются. */
  cornerHinges: number;
  lifts: number;
  flaps: number;
  handles: number;
  /** Модули, у которых направление не выбрано: смета говорит о них словами. */
  assumed: { label: string; opening: FrontOpening; basis: string }[];
};

export function openingHardware(
  units: { unit: Module; heightMm: number; index?: number; total?: number }[],
): OpeningHardware {
  const result: OpeningHardware = {
    hinges: 0,
    cornerHinges: 0,
    lifts: 0,
    flaps: 0,
    handles: 0,
    assumed: [],
  };

  for (const { unit, heightMm, index = 0, total = 1 } of units) {
    if (unit.frontType !== 'door') continue;

    const { opening, assumed, basis } = openingOf(unit, index, total);
    if (opening === 'none') {
      /*
       * Фасад есть, петель нет — это карго. Ручка ему всё равно нужна:
       * за неё выдвигают.
       */
      result.handles += 1;
      continue;
    }

    const doors = Math.max(1, unit.doorCount);
    const isCorner = unit.kind === 'corner_base' || unit.kind === 'corner_upper';

    if (isSwing(opening)) {
      const perDoor = hingesPerDoor(heightMm);
      if (isCorner) result.cornerHinges += doors * perDoor;
      else result.hinges += doors * perDoor;
    }

    if (opening === 'lift') {
      /*
       * Подъёмник ставят на ОДИН фасад: ради широкого фасада он и нужен.
       * Число створок здесь не умножается — модуль с подъёмником имеет
       * одну створку, и операция это обеспечивает.
       */
      result.lifts += 1;
    }

    if (opening === 'flap') {
      result.flaps += 1;
      result.hinges += hingesPerDoor(heightMm);
    }

    result.handles += isMechanism(opening) ? 1 : doors;

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
