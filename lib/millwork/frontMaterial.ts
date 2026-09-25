import type { FrontBase, FrontConstruct, FrontFinish, FrontSpec } from '@/types/millwork';

/**
 * МАТЕРИАЛ ФАСАДА: ТРИ НЕЗАВИСИМЫХ АТРИБУТА.
 *
 *   base       из чего сделан    ЛДСП, плёночный МДФ, эмаль, акрил, шпон
 *   construct  как собран        цельный, филёнчатый, радиусный
 *   finish     чем покрыт        глянец, мат, текстура
 *
 * Независимы они не до конца, и это НЕ декоративное ограничение: ЛДСП
 * пилится прямыми — радиуса из неё не бывает физически, а эмаль ложится
 * сплошным слоем, и кромке на таком фасаде взяться неоткуда. Конфигуратор
 * обязан знать эти правила: продать фасад, которого цех не сделает, хуже,
 * чем не продать ничего.
 *
 * Правила живут ЗДЕСЬ, одним списком. Разложенные по интерфейсу, раскрою
 * и промпту, они разойдутся на первом же новом материале.
 */

export const FRONT_BASES: Record<FrontBase, { title: string; short: string }> = {
  ldsp: { title: 'ЛДСП', short: 'ЛДСП' },
  mdf_film: { title: 'МДФ в плёнке', short: 'МДФ плёнка' },
  mdf_enamel: { title: 'МДФ в эмали', short: 'Эмаль' },
  acrylic: { title: 'Акрил', short: 'Акрил' },
  veneer_solid: { title: 'Шпон / массив', short: 'Шпон' },
};

export const FRONT_CONSTRUCTS: Record<FrontConstruct, { title: string }> = {
  solid: { title: 'Цельный' },
  framed: { title: 'Филёнчатый' },
  radius: { title: 'Радиусный' },
};

export const FRONT_FINISHES: Record<FrontFinish, { title: string }> = {
  gloss: { title: 'Глянец' },
  matte: { title: 'Мат' },
  textured: { title: 'Текстура' },
};

/**
 * Фасад по умолчанию.
 *
 * ЛДСП цельный матовый — самый дешёвый и самый частый: с него начинается
 * почти каждый разговор о кухне. Модуль без явного материала считается
 * именно таким, поэтому старые проекты ничего не теряют.
 */
export const DEFAULT_FRONT: FrontSpec = {
  base: 'ldsp',
  construct: 'solid',
  finish: 'matte',
};

export function frontOf(unit: { front?: FrontSpec }): FrontSpec {
  return unit.front ?? DEFAULT_FRONT;
}

/**
 * ПОЧЕМУ ТАК НЕЛЬЗЯ.
 *
 * Возвращает объяснение или `null`, если сочетание рабочее. Объяснение
 * называет ПРИЧИНУ, а не запрет: «ЛДСП пилится только прямыми» — это
 * факт производства, который замерщик перескажет клиенту слово в слово.
 * «Недопустимая комбинация» пересказать нельзя.
 */
export function frontConflict(spec: FrontSpec): string | null {
  if (spec.base === 'ldsp' && spec.construct !== 'solid') {
    return (
      'ЛДСП пилится только прямыми: радиусных и филёнчатых фасадов из неё не бывает. ' +
      'Нужен гнутый или наборный фасад — берите МДФ или шпон.'
    );
  }

  if (spec.construct === 'radius' && !RADIUS_BASES.includes(spec.base)) {
    return (
      `Радиусный фасад гнут из МДФ или шпона: ${FRONT_BASES[spec.base].title} так не гнётся. ` +
      'Оставьте цельный или смените материал.'
    );
  }

  return null;
}

/** Из чего гнут радиус. Всё остальное на радиусе трескается. */
const RADIUS_BASES: FrontBase[] = ['mdf_film', 'mdf_enamel', 'veneer_solid'];

/** Какие конструкции доступны этой базе. Интерфейс не показывает лишнего. */
export function constructsFor(base: FrontBase): FrontConstruct[] {
  return (Object.keys(FRONT_CONSTRUCTS) as FrontConstruct[]).filter(
    (construct) => frontConflict({ base, construct, finish: 'matte' }) === null,
  );
}

/**
 * ЕСТЬ ЛИ У ФАСАДА КРОМКА.
 *
 * Эмаль ложится сплошным слоем по лицу и торцам, плёнка запрессовывается
 * с загибом на торцы — клеить на них кромку не только не нужно, но и
 * некуда. Кромка на таком фасаде в раскрое — это метры ПВХ, которых цех
 * не купит, и деньги, которых в заказе нет.
 *
 * Смета берёт количества из раскроя, поэтому одного этого признака
 * достаточно: пропала строка кромки — пропали и метры, и деньги.
 */
export function hasEdgeBanding(spec: FrontSpec): boolean {
  return spec.base !== 'mdf_enamel' && spec.base !== 'mdf_film';
}

/**
 * ФИЛЁНЧАТЫЙ ФАСАД — ЭТО ДВЕ ДЕТАЛИ.
 *
 * Рама и вставка режутся отдельно и из разного: рама несущая, вставка
 * может быть тоньше и другого цвета. Одна панель в раскрое означала бы,
 * что цех получит гладкий фасад вместо филёнчатого — и узнает об этом
 * на сборке.
 */
export function isFramed(spec: FrontSpec): boolean {
  return spec.construct === 'framed';
}

/** Ширина обвязки филёнки: отраслевая, из интерфейса не меняется. */
export const FRAME_WIDTH_MM = 80;

/** Название материала детали в раскрое: технолог читает его как есть. */
export function frontMaterialName(spec: FrontSpec, thicknessMm: number): string {
  return `Фасад ${FRONT_BASES[spec.base].short} ${thicknessMm}`;
}

/**
 * Ключ материала для сцены и для группировки в раскрое.
 *
 * Модули с одинаковым фасадом обязаны попадать в ОДНУ пачку отрисовки:
 * иначе ряд из тринадцати модулей снова станет тринадцатью вызовами.
 */
export function frontKey(spec: FrontSpec): string {
  /*
   * АРТИКУЛ ВХОДИТ В КЛЮЧ.
   *
   * Два декора компании могут совпасть по шестнадцатеричному цвету —
   * «дуб сонома» и «дуб крафт» на схеме одинаковы, а в заказе это разные
   * плиты и разные деньги. Без артикула отпечаток их не различал бы, и
   * подписанная смета разошлась бы с тем, что уехало в цех.
   */
  /*
   * ФРЕЗЕРОВКА — ТОЖЕ ЧАСТЬ КЛЮЧА, И ПО ТОЙ ЖЕ ПРИЧИНЕ.
   *
   * Два фасада одного декора с разной фрезеровкой — это разные изделия,
   * разные операции в цеху и разные деньги. Без неё в ключе сцена рисует
   * их одной пачкой, то есть показывает клиенту один фасад там, где их
   * два, а отпечаток конфигурации их не различает.
   *
   * Умолчание в ключ не пишется (ловушка 246): у фасада без фрезеровки
   * строка та же, что была, и отпечатки сохранённых рядов не едут.
   */
  /*
   * ПОВЕРХНОСТЬ КАТАЛОГА — тоже часть ключа: High Gloss и Touch Sense
   * одной МДФ-панели — разные плиты, разные деньги и разный вид в сцене.
   * Пусто не пишется (ловушка 246): у прежних фасадов ключ прежний.
   */
  return `${spec.base}/${spec.construct}/${spec.finish}/${spec.colorHex ?? '-'}/${spec.itemId ?? '-'}${
    spec.millingId ? `/${spec.millingId}` : ''
  }${spec.surface ? `~${spec.surface}` : ''}`;
}

/**
 * Короткая подпись: «Эмаль, филёнчатый, мат».
 *
 * Одна строка и для ленты состава, и для выноски на чертеже — вторая
 * формулировка разошлась бы с первой.
 */
export function frontTitle(spec: FrontSpec): string {
  const parts = [FRONT_BASES[spec.base].title];
  if (spec.construct !== 'solid') parts.push(FRONT_CONSTRUCTS[spec.construct].title.toLowerCase());
  parts.push(FRONT_FINISHES[spec.finish].title.toLowerCase());
  return parts.join(', ');
}

/** Отпечаток фасада: другой материал — другая мебель и другие деньги. */
export function frontPart(spec: FrontSpec | undefined): string | undefined {
  if (!spec) return undefined;
  const key = frontKey(spec);
  // Умолчание не пишем: иначе изменились бы отпечатки всех прежних рядов.
  return key === frontKey(DEFAULT_FRONT) ? undefined : key;
}
