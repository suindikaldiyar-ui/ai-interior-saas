/**
 * ВИТРИНА (P1) — ОДИН РАЗБОР НА ПРОДУКТ.
 *
 * До P1 витрин было две, и друг о друге они не знали:
 *
 *   секция `glass_display` — дверь из стекла в раме своей отрисовкой, строкой
 *     `glass_front`; створки в `moduleFronts` у неё не было, и петли с ручкой
 *     для её двери не покупал никто;
 *   варианты «Стекло в раме», «Витрина», «Высокая витрина» — фасад ЛДСП в
 *     раскрое И стекло в смете (двойная оплата), в сцене — глухая дверь без
 *     стекла, вид стекла и стеклянные полки — отказ.
 *
 * Теперь обе — конструкция A этой функции, и всё, что спрашивает «витрина ли
 * это и из чего она», спрашивает её: сцена, раскрой, смета, отпечаток, чертёж,
 * свет и панель «Витрина». Прежним витринам умолчание в данные не пишется
 * (ловушка 246): отпечаток у них прежний до символа.
 *
 * ЧЕГО НЕТ И ЧТО НАЗВАНО СЛОВАМИ. Сечения профиля и паза под стекло в каталоге
 * организации нет, поэтому стекло двери в рамке — часть покупной двери по
 * наружному размеру; петель под стеклянную дверь без рамки, держателей
 * стеклянной полки, крепежа стекла к стеклу и профиля ленты в каталоге нет —
 * их строки без цены и с пометкой «требует подтверждения», отверстий под них
 * нет. Каркас из профиля (B) и цельностеклянная витрина (C) собираются в
 * сцене и деталировке, но выпуск в цех у них заперт словами: схему сборки
 * стекла цех не подтверждал.
 */
import type {
  FrontRelief,
  Module,
  ProfileFinish,
  Run,
  VitrineBack,
  VitrineConstruction,
  VitrineLed,
  VitrinePanel,
  VitrineSpec,
  VitrineView,
} from '@/types/millwork';
import { MODULE_VARIANTS, type ModuleVariantSpec } from './moduleVariants';
import { isUpperRow, standsOnFloor } from './modules';
import { designHasCut } from './reliefDesign';
import { zoneProfile } from './zones';

export const VITRINE_CONSTRUCTIONS: readonly VitrineConstruction[] = ['carcass', 'frame', 'glass'];

export const VITRINE_CONSTRUCTION_TITLE: Record<VitrineConstruction, string> = {
  carcass: 'Корпус и стеклянная дверь',
  frame: 'Алюминиевый каркас',
  glass: 'Цельностеклянная',
};

export const VITRINE_CONSTRUCTION_HINT: Record<VitrineConstruction, string> = {
  carcass: 'корпус из плиты, дверь — стекло в алюминиевой рамке',
  frame: 'каркас из профиля, стекло в его пазах: фасад, боковины по выбору, задняя стенка',
  glass: 'боковины, дверь, верх и низ — стекло; крепёж стекла цехом не подтверждён',
};

/** Толщины стекла на выбор, мм: ряд, который заказывают у стекольщика. Выбор — человека, подтверждение — цеха. */
export const GLASS_THICKNESS_MM: readonly number[] = [4, 5, 6, 8, 10];

export const PROFILE_FINISHES: readonly ProfileFinish[] = ['silver', 'black', 'champagne', 'bronze', 'gold'];

export const PROFILE_TITLE: Record<ProfileFinish, string> = {
  silver: 'Серебро',
  black: 'Чёрный',
  champagne: 'Шампань',
  bronze: 'Бронза',
  gold: 'Золото',
};

/** Цвет профиля в сцене и на образце — VISUAL_ONLY: позиции профиля в каталоге нет. */
export const PROFILE_HEX: Record<ProfileFinish, string> = {
  silver: '#B8BCC0',
  black: '#1F2022',
  champagne: '#C9B58F',
  bronze: '#7B5B3D',
  gold: '#C8A24A',
};

export const VITRINE_LEDS: readonly VitrineLed[] = ['off', 'left', 'right', 'sides', 'top', 'shelves', 'contour'];

export const VITRINE_LED_TITLE: Record<VitrineLed, string> = {
  off: 'Без подсветки',
  left: 'Слева',
  right: 'Справа',
  sides: 'С двух сторон',
  top: 'Сверху',
  shelves: 'Под полками',
  contour: 'По контуру',
};

export const VITRINE_BACK_TITLE: Record<VitrineBack, string> = {
  board: 'Плита (ХДФ цеха)',
  glass: 'Стекло',
  mirror: 'Зеркало',
  none: 'Без задней стенки',
};

export const VITRINE_PANEL_TITLE: Record<VitrinePanel, string> = {
  board: 'Плита',
  glass: 'Стекло',
};

export const VITRINE_VIEW_TITLE: Record<VitrineView, string> = {
  front: 'Спереди',
  back: 'Сзади',
  both: 'С двух сторон',
};

/** Части корпуса по конструкции, если человек их не выбирал. */
const DEFAULT_PANELS: Record<
  VitrineConstruction,
  { left: VitrinePanel; right: VitrinePanel; top: VitrinePanel; bottom: VitrinePanel; back: VitrineBack }
> = {
  carcass: { left: 'board', right: 'board', top: 'board', bottom: 'board', back: 'board' },
  frame: { left: 'glass', right: 'glass', top: 'board', bottom: 'board', back: 'glass' },
  glass: { left: 'glass', right: 'glass', top: 'glass', bottom: 'glass', back: 'glass' },
};

export type ResolvedVitrine = {
  construction: VitrineConstruction;
  left: VitrinePanel;
  right: VitrinePanel;
  top: VitrinePanel;
  bottom: VitrinePanel;
  back: VitrineBack;
  /** Толщина стекла корпуса и полок, мм; `null` — не выбрана. */
  glassMm: number | null;
  /** Покрытие профиля; `null` — не выбрано (у цельностеклянной профиля нет вовсе). */
  profile: ProfileFinish | null;
  led: VitrineLed;
  view: VitrineView;
  onCounter: boolean;
  depthMm: number | null;
  /** Откуда витрина: своя спецификация, прежняя секция или вариант со стеклом. */
  source: 'spec' | 'section' | 'variant';
};

/**
 * ПРЕЖНЯЯ ВИТРИНА — БЕЗ СВОЕЙ СПЕЦИФИКАЦИИ.
 *
 * Секция `glass_display` и варианты со стеклом (`transparentFront`) — это
 * конструкция A: корпус из плиты и стеклянная дверь. Подсветка — как её
 * считала смета до P1: у секции и у варианта со статьёй `led_display` — по
 * контуру, у «Стекла в раме» — нет.
 */
function legacyVitrine(unit: Pick<Module, 'section' | 'variant'>): { construction: VitrineConstruction; led: VitrineLed } | null {
  if (unit.section === 'glass_display') return { construction: 'carcass', led: 'contour' };
  const spec = unit.variant ? MODULE_VARIANTS[unit.variant] : undefined;
  if (!spec?.transparentFront) return null;
  return { construction: 'carcass', led: (spec.estimateKeys ?? []).includes('led_display') ? 'contour' : 'off' };
}

/** Витрина ли модуль и из чего она — одна функция на продукт; `null` — не витрина. */
export function vitrineOf(unit: Pick<Module, 'vitrine' | 'section' | 'variant'>): ResolvedVitrine | null {
  const legacy = legacyVitrine(unit);
  const spec = unit.vitrine;
  if (!spec && !legacy) return null;
  const construction = spec?.construction ?? legacy!.construction;
  const defaults = DEFAULT_PANELS[construction];
  /* У корпусной витрины боковины, верх и низ — корпус: стекло там — другая конструкция. */
  const own: Partial<Pick<VitrineSpec, 'left' | 'right' | 'top' | 'bottom'>> = construction === 'carcass' ? {} : (spec ?? {});
  return {
    construction,
    left: own.left ?? defaults.left,
    right: own.right ?? defaults.right,
    top: own.top ?? defaults.top,
    bottom: own.bottom ?? defaults.bottom,
    back: spec?.back ?? defaults.back,
    glassMm: spec?.glassMm ?? null,
    profile: construction === 'glass' ? null : (spec?.profile ?? null),
    led: spec?.led ?? legacy?.led ?? 'off',
    view: spec?.view ?? 'front',
    onCounter: spec?.onCounter === true,
    depthMm: spec?.depthMm ?? null,
    source: spec ? 'spec' : unit.section === 'glass_display' ? 'section' : 'variant',
  };
}

export const isVitrine = (unit: Pick<Module, 'vitrine' | 'section' | 'variant'>): boolean => vitrineOf(unit) !== null;

/** Стоит ли витрина на столешнице: низ — рабочая поверхность. */
export const vitrineOnCounter = (unit: Pick<Module, 'vitrine'>): boolean => unit.vitrine?.onCounter === true;

/**
 * СКОЛЬКО ДВЕРЕЙ У ВИТРИНЫ.
 *
 * Секция `glass_display` хранит дверь не створкой (`frontType: 'none'`, ловушка
 * про двойную оплату) — у неё одна стеклянная дверь. У остальных — их створки.
 */
export function vitrineDoorCount(unit: Pick<Module, 'vitrine' | 'section' | 'variant' | 'frontType' | 'doorCount'>): number {
  if (!vitrineOf(unit)) return 0;
  if (unit.section === 'glass_display' && unit.frontType === 'none') return 1;
  if (unit.frontType !== 'door') return 0;
  return Math.max(1, unit.doorCount);
}

/** Есть ли у витрины детали из стекла, кроме двери: боковины, верх, низ, задняя стенка. */
export function vitrineGlassBody(v: ResolvedVitrine): boolean {
  return v.left === 'glass' || v.right === 'glass' || v.top === 'glass' || v.bottom === 'glass' || v.back === 'glass' || v.back === 'mirror';
}

/**
 * ПОЧЕМУ ВИТРИНУ НЕ СОБРАТЬ В ЦЕХУ — словами. Пусто — собирается.
 *
 * Конструкция A — корпус цеха и покупная дверь по наружному размеру. B и C
 * держатся на стекле и профиле, а схемы их сборки цех не давал: по этим
 * деталям ничего не заказывают и не режут.
 */
export function vitrineProductionReasons(unit: Pick<Module, 'vitrine' | 'section' | 'variant' | 'label' | 'glassShelves' | 'fill'>): string[] {
  const v = vitrineOf(unit);
  if (!v) return [];
  const name = unit.label || 'витрина';
  const reasons: string[] = [];
  if (v.construction === 'frame') {
    reasons.push(`«${name}»: каркас из алюминиевого профиля — система профиля не выбрана, соединения и пазы под стекло не подтверждены цехом`);
  }
  if (v.construction === 'glass') {
    reasons.push(`«${name}»: цельностеклянная витрина — крепёж стекла к стеклу и петли стеклянной двери не подтверждены цехом`);
  }
  const glassParts = vitrineGlassBody(v) || (unit.glassShelves === true && !unit.fill?.bays);
  if (glassParts && v.glassMm === null) {
    reasons.push(`«${name}»: толщина стекла не выбрана — стекло корпуса и полок заказать нельзя`);
  }
  return reasons;
}

/* ─────────────────────────  что можно, а что нет  ───────────────────────── */

/** Секции, которые витриной не бывают, — и почему. */
const NOT_A_CABINET: Partial<Record<NonNullable<Module['section']>, string>> = {
  bench: 'скамья — сиденье, двери у неё нет',
  shoes: 'обувница открывается своим откидным механизмом',
  mirror: 'зеркало — панель на стене, а не шкаф',
  tv_niche: 'ниша под телевизор открытая: стекло закрыло бы экран',
};

/** Самый мелкий корпус витрины, мм: уже — полка не встанет (то же число, что самый узкий корпус ряда). */
export const VITRINE_MIN_DEPTH_MM = 150;
/** Ниже этого корпуса витрины не бывает: та же граница, что у навесного корпуса под ригелем. */
export const VITRINE_MIN_HEIGHT_MM = 300;

export type VitrineRunContext = Pick<Run, 'zone' | 'doorSystem'>;

/**
 * МОЖНО ЛИ СДЕЛАТЬ ВИТРИНОЙ ЭТОТ МОДУЛЬ — без конструкции.
 *
 * Отказ называет мир, а не «нельзя»: прибор, ящики, механизм, купе.
 */
export function vitrineBlocker(unit: Module, run: VitrineRunContext): string | null {
  const name = `«${unit.label || 'модуль'}»`;
  if (unit.kind === 'filler') return `${name}: доборная планка — не шкаф, витрины из неё не сделать.`;
  if (unit.appliance || unit.column) return `${name}: в модуле прибор — стекло двери закрыло бы технику.`;
  if (unit.kind === 'corner_base' || (unit.kind === 'corner_upper' && unit.cornerDoors !== 'pair')) {
    return `${name}: «книжка» углового модуля висит на угловых петлях 175°, а под алюминиевую рамку таких петель в каталоге нет — у верхнего Г-модуля выберите «Две дверцы» в карточке угла.`;
  }
  const section = unit.section ? NOT_A_CABINET[unit.section] : undefined;
  if (section) return `${name}: ${section}.`;
  if (unit.section === 'glass_display') return null;
  if (!unit.column && (unit.fill?.drawerHeights.length ?? 0) > 0) {
    return `${name}: у модуля ящики, а у витрины — дверь: сначала смените фасад на «Дверца».`;
  }
  if (unit.variant && MODULE_VARIANTS[unit.variant]?.pullOut) {
    return `${name}: модуль выдвигается целиком — стеклянной двери на петлях у него не бывает.`;
  }
  if (run.doorSystem === 'sliding' && standsOnFloor(unit)) {
    return `${name}: в шкафу-купе фасады — полотна купе, и стеклянная дверь витрины встала бы за полотном. Переключите двери ряда на распашные.`;
  }
  return null;
}

/**
 * ПРОВЕРКА СПЕЦИФИКАЦИИ ДО ЗАПИСИ — словами; `null` — встаёт.
 *
 * Здесь только то, что видно по модулю и ряду без геометрии соседей: столешницу
 * под витриной, мойку и варочную под ней, высоту до потолка проверяет правка
 * (`counterRefusal` и `vitrineHeightRefusal` в `applyOps`), — ей видны модули ряда.
 */
export function vitrineSpecRefusal(unit: Module, run: VitrineRunContext & Pick<Run, 'production'>, spec: VitrineSpec): string | null {
  const blocker = vitrineBlocker(unit, run);
  if (blocker) return blocker;
  const name = `«${unit.label || 'модуль'}»`;
  if (!VITRINE_CONSTRUCTIONS.includes(spec.construction)) return `${name}: конструкции «${String(spec.construction)}» нет.`;
  const bears = standsOnFloor(unit) && !isTallKind(unit);
  if (bears && spec.construction !== 'carcass') {
    return `${name}: под столешницей стеклянный корпус её не удержит — плита ляжет на стекло. Под столешницей витрина — «${VITRINE_CONSTRUCTION_TITLE.carcass}».`;
  }
  if (spec.construction === 'carcass' && (spec.left === 'glass' || spec.right === 'glass' || spec.top === 'glass' || spec.bottom === 'glass')) {
    return `${name}: у витрины «${VITRINE_CONSTRUCTION_TITLE.carcass}» корпус из плиты; стеклянные боковины — у «${VITRINE_CONSTRUCTION_TITLE.frame}» или «${VITRINE_CONSTRUCTION_TITLE.glass}».`;
  }
  if (spec.construction === 'glass' && spec.profile) {
    return `${name}: у цельностеклянной витрины профиля нет — стекло стоит на креплениях.`;
  }
  if (spec.glassMm !== undefined && !GLASS_THICKNESS_MM.includes(spec.glassMm)) {
    return `${name}: стекла ${spec.glassMm} мм в ряду толщин нет — ${GLASS_THICKNESS_MM.join(', ')} мм.`;
  }
  if (spec.view === 'back' || spec.view === 'both') {
    return `${name}: витрина стоит задом к стене — смотреть и открывать её сзади негде. Двусторонняя витрина — только отдельно стоящая, а ряды здесь все у стен.`;
  }
  if (spec.led === 'shelves' && (unit.fill?.shelves.length ?? 0) === 0 && !unit.fill?.bays) {
    return `${name}: полок нет — ленте под полками некуда встать.`;
  }
  if (spec.onCounter) {
    if (!(unit.kind === 'upper') || unit.section === 'mezzanine' || unit.overhead) {
      return `${name}: на столешницу ставится навесной модуль верхнего ряда — у этого модуля своё место.`;
    }
    if (!zoneProfile(run.zone).hasCountertop) {
      return `${name}: ${zoneProfile(run.zone).locative} столешницы нет — ставить витрину не на что.`;
    }
  }
  if (spec.depthMm !== undefined) {
    if (unit.section === 'mezzanine' || unit.overhead) {
      return `${name}: глубину ${unit.overhead ? 'корпуса над шкафом задаёт его блок' : 'антресоли задаёт её ряд'}.`;
    }
    if (bears) return `${name}: под столешницей глубина — ряда: плита лежит на корпусах одной глубины.`;
    if (spec.depthMm < VITRINE_MIN_DEPTH_MM) {
      return `${name}: глубина ${spec.depthMm} мм — мельче ${VITRINE_MIN_DEPTH_MM} мм полка не встанет.`;
    }
  }
  return null;
}

/** Пенал или высокая секция: стоит на полу, но столешницу не несёт. */
function isTallKind(unit: Pick<Module, 'kind'>): boolean {
  return unit.kind === 'tall';
}

/**
 * СПЕЦИФИКАЦИЯ К ЗАПИСИ: без полей, равных умолчанию (ловушка 246).
 *
 * Прежней витрине (секция, вариант) спецификация, совпавшая с её умолчанием,
 * не пишется вовсе: иначе отпечаток уехал бы от одного нажатия без изменения
 * мебели. У нового модуля остаётся хотя бы конструкция — она и делает его
 * витриной.
 */
export function storedVitrine(unit: Pick<Module, 'section' | 'variant'>, spec: VitrineSpec): VitrineSpec | undefined {
  const legacy = legacyVitrine(unit);
  const defaults = DEFAULT_PANELS[spec.construction];
  const out: VitrineSpec = { construction: spec.construction };
  if (spec.construction !== 'carcass') {
    if (spec.left && spec.left !== defaults.left) out.left = spec.left;
    if (spec.right && spec.right !== defaults.right) out.right = spec.right;
    if (spec.top && spec.top !== defaults.top) out.top = spec.top;
    if (spec.bottom && spec.bottom !== defaults.bottom) out.bottom = spec.bottom;
  }
  if (spec.back && spec.back !== defaults.back) out.back = spec.back;
  if (spec.glassMm !== undefined) out.glassMm = spec.glassMm;
  if (spec.profile && spec.construction !== 'glass') out.profile = spec.profile;
  const ledDefault = legacy?.led ?? 'off';
  if (spec.led && spec.led !== ledDefault) out.led = spec.led;
  if (spec.view && spec.view !== 'front') out.view = spec.view;
  if (spec.onCounter) out.onCounter = true;
  if (spec.depthMm !== undefined) out.depthMm = spec.depthMm;
  const onlyConstruction = Object.keys(out).length === 1;
  if (legacy && onlyConstruction && out.construction === legacy.construction) return undefined;
  return out;
}

/**
 * СПЕЦИФИКАЦИЯ С ПРАВКОЙ — от того, что записано у модуля (у прежней витрины —
 * от её конструкции): правка одной настройки не теряет остальные.
 */
export function vitrinePatched(unit: Pick<Module, 'vitrine' | 'section' | 'variant'>, patch: Partial<VitrineSpec>): VitrineSpec | null {
  const v = vitrineOf(unit);
  const base: VitrineSpec = unit.vitrine ?? { construction: v?.construction ?? 'carcass' };
  return { ...base, ...patch };
}

/**
 * ВИТРИНА В ОТПЕЧАТКЕ — только то, что записано (ловушка 246): у прежних
 * витрин и у рядов без витрин строка прежняя до символа.
 */
export function vitrinePart(unit: Pick<Module, 'vitrine'>): string {
  const spec = unit.vitrine;
  if (!spec) return '';
  const keys = Object.keys(spec).sort() as (keyof VitrineSpec)[];
  return `vit{${keys.map((key) => `${key}:${String(spec[key])}`).join(';')}}`;
}

/* ─────────────────────────  размеры стекла корпуса  ───────────────────────── */

/** Ширина профиля рамки и каркаса, мм — VISUAL_ONLY: системы профиля в каталоге нет, в сцене 20 мм условно. */
export const VITRINE_PROFILE_MM = 20;
/** Толщина стекла, которой сцена рисует стекло с невыбранной толщиной, мм — VISUAL_ONLY. */
export const VITRINE_GLASS_SHOWN_MM = 6;

/** Насколько деталь каркаса из профиля утоплена в паз планки с каждой стороны, где планка идёт, мм. */
export const vitrineGrooveMm = (v: Pick<ResolvedVitrine, 'construction'>): number => (v.construction === 'frame' ? VITRINE_PROFILE_MM / 2 : 0);

/**
 * СТЕКЛО БОКОВИНЫ, КРЫШИ И ДНА — РАЗМЕР, мм: одна формула на сцену и список
 * стекла (P1). По детали корпуса, которую стекло заменило: боковина —
 * высота × глубина, крыша и дно — между боковинами (толщина плиты цеха) ×
 * глубина. У каркаса из профиля деталь стоит в пазу планок — на половину
 * профиля меньше с каждой стороны, где планка идёт. До этой функции сцена
 * рисовала боковину каркаса 700 × 300, а список заказывал 720 × 320.
 */
export function vitrineBodyGlassMm(
  role: 'side' | 'top' | 'bottom',
  unit: Pick<Module, 'widthMm'>,
  v: Pick<ResolvedVitrine, 'construction'>,
  heightMm: number,
  depthMm: number,
  carcassMm: number,
): { lengthMm: number; widthMm: number } {
  const g = vitrineGrooveMm(v);
  if (role === 'side') return { lengthMm: Math.max(10, heightMm - 2 * g), widthMm: Math.max(10, depthMm - 2 * g) };
  return { lengthMm: Math.max(10, unit.widthMm - 2 * carcassMm), widthMm: Math.max(10, depthMm - 2 * g) };
}

/**
 * ЗАДНЯЯ СТЕНКА ИЗ СТЕКЛА ИЛИ ЗЕРКАЛА — РАЗМЕР, мм: одна формула на сцену и
 * список стекла (P1). Стоит между боковинами — стекло не заходит на торец
 * соседней детали — во всю высоту корпуса; у каркаса из профиля — внутри
 * планок, в их пазу. Толщина боковины — её материала: плита цеха или стекло
 * (не выбрано — как рисует сцена, и это сказано у строки).
 *
 * До этой функции было две формулы: сцена ставила стекло во всю высоту между
 * боковинами толщины плиты, список — по задней стенке ХДФ цеха (минус
 * припуск паза): 650 × 468 в кадре против 642 × 492 в заказе.
 */
export function vitrineBackMm(
  unit: Pick<Module, 'widthMm'>,
  v: Pick<ResolvedVitrine, 'construction' | 'left' | 'right' | 'glassMm'>,
  heightMm: number,
  carcassMm: number,
): { widthMm: number; heightMm: number } {
  const glassMm = v.glassMm ?? VITRINE_GLASS_SHOWN_MM;
  const sideMm = (part: 'left' | 'right') => (v[part] === 'glass' ? glassMm : carcassMm);
  const inset = vitrineGrooveMm(v);
  return {
    widthMm: Math.max(10, unit.widthMm - 2 * inset - sideMm('left') - sideMm('right')),
    heightMm: Math.max(10, heightMm - 2 * inset),
  };
}

/* ─────────────────────────  подсветка  ───────────────────────── */

/** Полоса ленты витрины в осях модуля, мм: x от левого края, y от низа корпуса, z от фасада назад (минус). */
export type VitrineLedStrip = { key: string; center: [number, number, number]; lengthMm: number; axis: 'x' | 'y'; facing: 'down' | 'left' | 'right' };

/** Отступ ленты от фасада внутрь, мм — условно: профиля ленты в каталоге нет. */
export const VITRINE_LED_INSET_MM = 40;

/**
 * ЛЕНТЫ ВИТРИНЫ — ОДНА РАСКЛАДКА НА СЦЕНУ И СМЕТУ.
 *
 * До P1 смета считала ленту по наружному контуру модуля (`2 × (Ш + В)`), а
 * сцена клала её по проёму — две формулы одной длины. Теперь длина — сумма
 * этих полос: вертикали у боковин по просвету, горизонтали под крышей и над
 * дном, под полками — по просвету у переднего края полки.
 */
export function vitrineLedStrips(
  unit: Pick<Module, 'widthMm' | 'fill'>,
  led: VitrineLed,
  heightMm: number,
  carcassMm: number,
): VitrineLedStrip[] {
  if (led === 'off') return [];
  const w = unit.widthMm;
  const t = carcassMm;
  const z = -VITRINE_LED_INSET_MM;
  const innerH = Math.max(0, heightMm - 2 * t);
  const innerW = Math.max(0, w - 2 * t);
  const left: VitrineLedStrip = { key: 'left', center: [t + 6, heightMm / 2, z], lengthMm: innerH, axis: 'y', facing: 'right' };
  const right: VitrineLedStrip = { key: 'right', center: [w - t - 6, heightMm / 2, z], lengthMm: innerH, axis: 'y', facing: 'left' };
  const top: VitrineLedStrip = { key: 'top', center: [w / 2, heightMm - t - 6, z], lengthMm: innerW, axis: 'x', facing: 'down' };
  const bottom: VitrineLedStrip = { key: 'bottom', center: [w / 2, t + 6, z], lengthMm: innerW, axis: 'x', facing: 'down' };
  if (led === 'left') return [left];
  if (led === 'right') return [right];
  if (led === 'sides') return [left, right];
  if (led === 'top') return [top];
  if (led === 'contour') return [left, right, top, bottom];
  const shelves = (unit.fill?.bays ? [] : (unit.fill?.shelves ?? [])).map(
    (mm, i): VitrineLedStrip => ({ key: `shelf-${i}`, center: [w / 2, mm - t / 2 - 6, z], lengthMm: innerW, axis: 'x', facing: 'down' }),
  );
  return [top, ...shelves];
}

/** Погонные метры ленты витрины — сумма полос `vitrineLedStrips`, до сотых. */
export function vitrineLedMeters(strips: VitrineLedStrip[]): number {
  return Math.round((strips.reduce((sum, s) => sum + s.lengthMm, 0) / 1000) * 100) / 100;
}

/* ─────────────────────────  слова для смет и панели  ───────────────────────── */

/** Строка о витрине одной фразой: «Корпус и стеклянная дверь · стекло 6 мм · профиль чёрный · подсветка по бокам». */
export function vitrineSummary(v: ResolvedVitrine): string {
  const parts = [VITRINE_CONSTRUCTION_TITLE[v.construction]];
  parts.push(v.glassMm ? `стекло ${v.glassMm} мм` : 'толщина стекла не выбрана');
  if (v.construction !== 'glass') parts.push(v.profile ? `профиль: ${PROFILE_TITLE[v.profile].toLowerCase()}` : 'покрытие профиля не выбрано');
  parts.push(v.led === 'off' ? 'без подсветки' : `подсветка: ${VITRINE_LED_TITLE[v.led].toLowerCase()}`);
  if (v.onCounter) parts.push('на столешнице');
  return parts.join(' · ');
}

/**
 * РАМА ВИТРИНЫ KIRA ЛОЖИТСЯ ТОЛЬКО НА ВИТРИНУ (слой 58, P1).
 *
 * Рама со сквозными окнами (`cut`) — створка под стекло. Стекло за ней есть,
 * только если модуль — витрина: прежний вариант со стеклом или своя
 * конструкция («Витрина» в панели). Поставь раму на глухую дверь — сцена
 * покажет стекло, которого никто не оплатил. У цельностеклянной витрины дверь —
 * стекло без рамки: рама МДФ на неё не встаёт. До P1 проверка смотрела только
 * на вариант, и витрина, собранная в панели, раму не принимала.
 */
export function vitrineFrameRefusal(
  unit: Pick<Module, 'label'> & Partial<Pick<Module, 'vitrine' | 'section' | 'variant'>>,
  relief: FrontRelief | undefined,
): string | null {
  if (!relief || relief.kind !== 'design' || !designHasCut(relief.design)) return null;
  const v = vitrineOf(unit);
  if (v?.construction === 'glass') {
    return `«${unit.label}»: у цельностеклянной витрины дверь — стекло без рамки, рама МДФ под стекло на неё не встаёт.`;
  }
  if (v) return null;
  const glassy = (Object.values(MODULE_VARIANTS) as ModuleVariantSpec[])
    .filter((spec) => spec.transparentFront)
    .map((spec) => `«${spec.title}»`)
    .join(', ');
  return `«${unit.label}»: рама витрины — под стекло, а стекла у этого шкафа в смете нет. Сначала сделайте шкаф витриной (блок «Витрина») или вариант шкафа ${glassy}, потом рама.`;
}

/** Модуль навесного ряда, который может встать на столешницу. */
export const canStandOnCounter = (unit: Pick<Module, 'kind' | 'section' | 'overhead'>): boolean =>
  unit.kind === 'upper' && unit.section !== 'mezzanine' && !unit.overhead && isUpperRow(unit);
