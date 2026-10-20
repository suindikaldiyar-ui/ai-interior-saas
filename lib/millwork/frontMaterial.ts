import type { FrontBase, FrontConstruct, FrontFinish, FrontSpec, PanelStock, StockKind } from '@/types/millwork';
import { reliefKey, reliefKindDef } from './facadeRelief';

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
 * ФАСАД ОДНОЙ СТВОРКИ ИЛИ ЯЩИКА (P3D-MDF) — одна точка чтения.
 *
 * `leaf` — деталь модуля так, как её зовёт сцена после имени модуля:
 * `door:0`, `drawer:1`, `b1:drawer:0`. Своего фасада у створки нет —
 * фасад модуля. Сцена, раскрой, смета и отпечаток спрашивают ЭТУ функцию:
 * своя ветка «какой фасад у двери» в любом из них развела бы картинку с
 * цехом.
 */
export function leafFrontOf(unit: { front?: FrontSpec; leafFronts?: Record<string, FrontSpec> }, leaf: string | null): FrontSpec {
  const own = leaf ? unit.leafFronts?.[leaf] : undefined;
  return own ?? frontOf(unit);
}

/** Подпись детали модуля: «Дверь 2», «Ящик 1», «Ящик 3 · отсек b2». */
export function leafTitle(leaf: string): string {
  const door = /^door:(\d+)$/.exec(leaf);
  if (door) return `Дверь ${Number(door[1]) + 1}`;
  const drawer = /^drawer:(\d+)$/.exec(leaf);
  if (drawer) return `Ящик ${Number(drawer[1]) + 1}`;
  const bay = /^([^:]+):drawer:(\d+)$/.exec(leaf);
  if (bay) return `Ящик ${Number(bay[2]) + 1} · отсек ${bay[1]}`;
  return leaf;
}

/** Деталь модуля по идентификатору сцены: `<модуль>:door:0` → `door:0`. */
export function leafOfPart(moduleId: string, partId: string): string | null {
  return partId.startsWith(`${moduleId}:`) ? partId.slice(moduleId.length + 1) : null;
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

  /*
   * РЕЛЬЕФ (P3D-MDF) ФРЕЗЕРУЮТ ПО МДФ И ПО ЦЕЛЬНОЙ ПЛИТЕ.
   *
   * ЛДСП под фрезой крошится, у акрила фреза прорежет пластик лица; у
   * филёнки рама и вставка — уже отдельные детали, у радиусного — гнутая
   * плита. Это факты производства, а не настройка: тип рисунка ложится на
   * эмаль, плёнку и шпон по МДФ.
   */
  if (spec.relief) {
    if (!RELIEF_BASES.includes(spec.base)) {
      return (
        `Рисунок фасада фрезеруют по МДФ: ${FRONT_BASES[spec.base].title} так не фрезеруется — ` +
        'лицо раскрошится. Нужен рисунок — берите МДФ в эмали, в плёнке или шпон.'
      );
    }
    if (spec.construct !== 'solid') {
      return (
        'Рисунок фрезеруют по цельной плите: у филёнчатого фасада рама и вставка — отдельные детали, ' +
        'у радиусного — гнутая плита. Оставьте цельный фасад.'
      );
    }
  }

  return null;
}

/** По каким базам ложится рельеф МДФ-фасада. */
export const RELIEF_BASES: FrontBase[] = ['mdf_enamel', 'mdf_film', 'veneer_solid'];

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
  return !coatedAfterCut(spec);
}

/**
 * ПОКРЫТИЕ — ПОСЛЕ РАСКРОЯ: эмаль и плёнка (CUT-01).
 *
 * Одно правило на два вопроса: у такого фасада нет кромки
 * (`hasEdgeBanding`) — покрытие закрывает торцы, — и режут его из МДФ без
 * покрытия (`frontStock`): цвет RAL и плёнка листы не делят.
 */
export function coatedAfterCut(spec: FrontSpec): boolean {
  return spec.base === 'mdf_enamel' || spec.base === 'mdf_film';
}

/**
 * ИЗ КАКОГО ЛИСТА РЕЖЕТСЯ ФАСАД (CUT-01) — одна функция на деталировку и
 * карту раскроя.
 *
 * Эмаль и плёнка — покрытие после раскроя (`coatedAfterCut`): лист — МДФ без
 * покрытия. ЛДСП, МДФ-панель (акрил) и шпон приходят с лицом: лист делит
 * декор — позиция каталога, без неё цвет. Нет ни позиции, ни цвета — декор
 * не выбран, и это говорится словами, а не подставляется.
 *
 * ПОВЕРХНОСТЬ ДЕЛИТ ЛИСТ ТОЛЬКО У МДФ-ПАНЕЛИ: High Gloss и Touch Sense одного
 * цвета — разные плиты (`FrontSpec.surface`). У ЛДСП плиту называет артикул
 * (EGGER-H1113-ST10 — структура ST10 уже в нём), а «текстура декора» или
 * «мат» — подсказка сцене, не другой лист; лак шпона ложится после раскроя.
 */
export function frontStock(spec: FrontSpec): PanelStock {
  if (coatedAfterCut(spec)) return { kind: 'mdf', decor: 'raw' };
  const kind: StockKind = spec.base === 'ldsp' ? 'ldsp' : spec.base === 'acrylic' ? 'mdf' : 'veneer';
  const decor = spec.itemId ? `item:${spec.itemId}` : spec.colorHex ? `color:${spec.colorHex.toLowerCase()}` : null;
  return spec.surface && spec.base === 'acrylic' ? { kind, decor, surface: spec.surface } : { kind, decor };
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
  /*
   * РЕЛЬЕФ (P3D-MDF) — тоже часть ключа: рифлёный и гладкий фасад одного
   * цвета — разная мебель, и пачки отрисовки у них разные. Ключ — то, что
   * нарисовано (параметры с умолчаниями типа); пусто не пишется, у прежних
   * фасадов ключ прежний до символа (ловушка 246).
   */
  return `${spec.base}/${spec.construct}/${spec.finish}/${spec.colorHex ?? '-'}/${spec.itemId ?? '-'}${
    spec.millingId ? `/${spec.millingId}` : ''
  }${spec.surface ? `~${spec.surface}` : ''}${spec.relief ? `#${reliefKey(spec.relief)}` : ''}`;
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
  /* Рисунок МДФ (P3D-MDF) — тем же словом, что на карточке типа; у модели — её ключ. */
  if (spec.relief) {
    parts.push(
      spec.relief.kind === 'design' && spec.relief.model
        ? `модель ${spec.relief.model}`
        : reliefKindDef(spec.relief.kind).title.toLowerCase(),
    );
  }
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
