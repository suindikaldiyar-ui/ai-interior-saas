import { APPLIANCE_SLOTS } from './modules';
import { applianceRowWidthMm } from './layout';
import { SECTION_SPECS, sectionSpec } from './sections';
import { ZONE_ORDER, zoneProfile } from './zones';
import type {
  ApplianceKind,
  DoorSystem,
  RunOptions,
  RunRequirements,
  SectionKind,
  ZoneKind,
} from '@/types/millwork';

/**
 * Готовые конфигурации.
 *
 * Замерщик не должен собирать гарнитур из модулей: в девяти случаях из
 * десяти он выбирает типовое решение и правит длину. Шаблон — это НЕ своя
 * раскладка: он задаёт состав техники и сторону колонн, а раскладку по-прежнему
 * считает `buildRun` по длине из замера. Иначе чертёж и смета разойдутся.
 */

export type RunLayout = 'linear' | 'corner_l' | 'u_shape';

export interface RunTemplate {
  id: string;
  name: string;
  /** Одна строка о том, для чего этот шаблон. */
  hint: string;
  /** Зона, для которой этот шаблон. Без неё — кухня. */
  zone?: ZoneKind;
  layout: RunLayout;
  minLengthMm: number;
  maxLengthMm: number;
  appliances: ApplianceKind[];
  tallSide: 'left' | 'right';
  /** Состав секций для зон без техники. */
  sections?: SectionKind[];
  /** Купе или распашные — у шкафа это главное решение. */
  doorSystem?: DoorSystem;
  /** Витрина с подсветкой в торце ряда. */
  glassDisplay?: boolean;
  /** Отличия от базовых опций ряда. */
  options?: Partial<RunOptions>;
}

export const DEFAULT_OPTIONS: RunOptions = {
  hasUpper: true,
  upperToCeiling: false,
  hardwareClass: 'standard',
  countertop: 'ldsp',
  hasCornice: false,
  integratedHandles: false,
};

/**
 * Минимальный набор, закрывающий большинство заказов. Не каталог решений,
 * а первый экран после замера: длинный список здесь так же вреден, как
 * пустой конструктор.
 */
export const RUN_TEMPLATES: RunTemplate[] = [
  {
    id: 'linear-compact',
    name: 'Прямая компактная',
    hint: 'Мойка и варочная в ряд, холодильник отдельно',
    layout: 'linear',
    minLengthMm: 1800,
    maxLengthMm: 2400,
    appliances: ['sink600', 'hob', 'hood'],
    tallSide: 'left',
  },
  {
    id: 'linear-standard',
    name: 'Прямая стандартная',
    hint: 'Холодильник, мойка, посудомойка, варочная',
    layout: 'linear',
    minLengthMm: 2400,
    maxLengthMm: 3400,
    appliances: ['fridge', 'sink600', 'dishwasher45', 'hob', 'hood'],
    tallSide: 'left',
  },
  {
    id: 'linear-column',
    name: 'Прямая с колонной',
    hint: 'Духовой шкаф в колонне на уровне глаз',
    layout: 'linear',
    minLengthMm: 3000,
    maxLengthMm: 4200,
    appliances: ['fridge', 'oven', 'sink600', 'dishwasher45', 'hob', 'hood'],
    tallSide: 'left',
  },
  {
    id: 'corner-compact',
    name: 'Угловая компактная',
    hint: 'Мойка в углу, варочная на короткой стороне',
    layout: 'corner_l',
    minLengthMm: 2400,
    maxLengthMm: 3200,
    appliances: ['sink600', 'hob', 'hood', 'fridge'],
    tallSide: 'right',
  },
  {
    id: 'corner-columns',
    name: 'Угловая с колоннами',
    hint: 'Колонны в торце, мойка у окна',
    layout: 'corner_l',
    minLengthMm: 3200,
    maxLengthMm: 4600,
    appliances: ['fridge', 'oven', 'sink600', 'dishwasher60', 'hob', 'hood'],
    tallSide: 'left',
  },
  {
    id: 'u-shape',
    name: 'П-образная',
    hint: 'Три ряда, мойка по центру',
    layout: 'u_shape',
    /*
     * 3400, а не 3000: техника этого шаблона занимает 3200 мм, и обещать
     * ряд короче — значит показать карточку, которая не соберётся.
     */
    minLengthMm: 3400,
    maxLengthMm: 5000,
    appliances: ['fridge', 'oven', 'sink800', 'dishwasher60', 'hob', 'hood'],
    tallSide: 'left',
  },

  {
    id: 'linear-two-columns',
    name: 'С двумя колоннами',
    hint: 'Холодильник и колонна духовка + СВЧ в торце',
    layout: 'linear',
    /*
     * Духовка и микроволновка стоят в ОДНОМ пенале 600 мм, поэтому
     * техника занимает 2850, а не 3450 — см. applianceRowWidthMm.
     */
    minLengthMm: 3200,
    maxLengthMm: 4600,
    appliances: ['fridge', 'oven', 'microwave', 'sink600', 'dishwasher45', 'hob', 'hood'],
    tallSide: 'left',
  },
  {
    id: 'linear-display',
    name: 'С витриной',
    hint: 'Стеклянная секция с подсветкой в торце ряда',
    layout: 'linear',
    minLengthMm: 3000,
    maxLengthMm: 4200,
    appliances: ['fridge', 'sink600', 'dishwasher45', 'hob', 'hood'],
    tallSide: 'left',
    glassDisplay: true,
  },
  {
    id: 'linear-to-ceiling',
    name: 'До потолка',
    hint: 'Верхний ряд во всю высоту, антресоль не нужна',
    layout: 'linear',
    minLengthMm: 2400,
    maxLengthMm: 4200,
    appliances: ['fridge', 'sink600', 'dishwasher45', 'hob', 'hood'],
    tallSide: 'left',
    options: { upperToCeiling: true },
  },
  {
    id: 'linear-no-upper',
    name: 'Без верхнего ряда',
    hint: 'Открытая стена: только нижний ряд и колонны',
    layout: 'linear',
    minLengthMm: 2400,
    maxLengthMm: 4200,
    appliances: ['fridge', 'oven', 'sink600', 'hob'],
    tallSide: 'left',
    options: { hasUpper: false },
  },

  /* ─────────────  Спальня: шкаф-купе  ───────────── */
  {
    id: 'wardrobe-sliding',
    name: 'Шкаф-купе',
    hint: 'Штанга, полки, ящики; закрыт полотнами купе',
    zone: 'bedroom',
    layout: 'linear',
    // штанга, полки, ящики и вторая штанга занимают 2000 мм
    minLengthMm: 2000,
    maxLengthMm: 4500,
    appliances: [],
    tallSide: 'left',
    sections: ['hanging_long', 'shelves', 'drawers', 'hanging_double'],
    doorSystem: 'sliding',
    options: { hasUpper: false },
  },
  {
    id: 'wardrobe-hinged',
    name: 'Шкаф распашной',
    hint: 'Распашные фасады и антресоль, глубина меньше',
    zone: 'bedroom',
    layout: 'linear',
    // штанга, полки и ящики занимают 1400 мм
    minLengthMm: 1400,
    maxLengthMm: 3600,
    appliances: [],
    tallSide: 'left',
    sections: ['hanging_long', 'shelves', 'drawers', 'mezzanine'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },

  {
    id: 'wardrobe-two-rods',
    name: 'Две штанги',
    hint: 'Верх и низ под короткое: рубашки и брюки',
    zone: 'bedroom',
    layout: 'linear',
    // две секции по 600 мм плюс полки 400: минимум 1600
    minLengthMm: 1600,
    maxLengthMm: 3000,
    appliances: [],
    tallSide: 'left',
    sections: ['hanging_double', 'hanging_double', 'shelves'],
    doorSystem: 'sliding',
    options: { hasUpper: false },
  },
  {
    id: 'wardrobe-shelves-drawers',
    name: 'Полки и ящики',
    hint: 'Без штанги: под сложенное и бельё',
    zone: 'bedroom',
    layout: 'linear',
    minLengthMm: 1200,
    maxLengthMm: 3200,
    appliances: [],
    tallSide: 'left',
    sections: ['shelves', 'drawers', 'shelves'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'wardrobe-display',
    name: 'Штанга и витрина',
    hint: 'Стеклянная секция с подсветкой на виду',
    zone: 'bedroom',
    layout: 'linear',
    // штанга, полки и витрина занимают 1300 мм
    minLengthMm: 1300,
    maxLengthMm: 3600,
    appliances: [],
    tallSide: 'left',
    sections: ['hanging_long', 'shelves', 'glass_display'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'wardrobe-combined',
    name: 'Комбинированный',
    hint: 'Закрытые секции плюс открытая ниша',
    zone: 'bedroom',
    layout: 'linear',
    // штанга 600 + ниша 300 + полки 400 + ящики 400
    minLengthMm: 1700,
    maxLengthMm: 4000,
    appliances: [],
    tallSide: 'left',
    sections: ['hanging_long', 'open', 'shelves', 'drawers'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'wardrobe-mezzanine',
    name: 'Купе с антресолью',
    /*
     * Отличается от «Шкафа распашного» не только словом: полотна купе
     * считаются по м², петель и фасадов в смете нет вовсе. Два решения
     * с одинаковым составом — это две карточки, собирающие одну мебель;
     * такую пару ловит приёмка отпечатков.
     */
    hint: 'Полотна купе, верх до потолка под сезонное',
    zone: 'bedroom',
    layout: 'linear',
    minLengthMm: 1400,
    maxLengthMm: 4000,
    appliances: [],
    tallSide: 'left',
    sections: ['hanging_long', 'shelves', 'drawers', 'mezzanine'],
    doorSystem: 'sliding',
    options: { hasUpper: false },
  },
  {
    id: 'wardrobe-open',
    name: 'Гардеробный',
    hint: 'Всё открытое, без фасадов',
    zone: 'bedroom',
    layout: 'linear',
    // ниша 300 + штанга 600 + ниша 300 + полки 400
    minLengthMm: 1600,
    maxLengthMm: 4000,
    appliances: [],
    tallSide: 'left',
    sections: ['open', 'hanging_long', 'open', 'shelves'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'wardrobe-sliding-3',
    name: 'Купе на три двери',
    hint: 'Для стены от 2400 мм',
    zone: 'bedroom',
    layout: 'linear',
    minLengthMm: 2400,
    maxLengthMm: 4500,
    appliances: [],
    tallSide: 'left',
    sections: ['hanging_long', 'shelves', 'drawers', 'hanging_double', 'shelves'],
    doorSystem: 'sliding',
    options: { hasUpper: false },
  },

  /* ─────────────  Прихожая  ───────────── */
  {
    id: 'hallway-open',
    name: 'Открытая вешалка',
    hint: 'Крючки, обувница, скамья, зеркало',
    zone: 'hallway',
    layout: 'linear',
    // крючки, обувница, скамья и зеркало занимают 1600 мм
    minLengthMm: 1600,
    maxLengthMm: 3000,
    appliances: [],
    tallSide: 'left',
    sections: ['hooks', 'shoes', 'bench', 'mirror'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'hallway-closed',
    name: 'Закрытая прихожая',
    hint: 'Шкаф с антресолью, обувница, зеркало на фасаде',
    zone: 'hallway',
    layout: 'linear',
    minLengthMm: 1600,
    maxLengthMm: 3600,
    appliances: [],
    tallSide: 'left',
    sections: ['shelves', 'shoes', 'mirror', 'mezzanine'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },

  {
    id: 'hallway-bench',
    name: 'С обувницей и скамьёй',
    hint: 'Сесть, обуться, убрать обувь',
    zone: 'hallway',
    layout: 'linear',
    minLengthMm: 1400,
    maxLengthMm: 3000,
    appliances: [],
    tallSide: 'left',
    sections: ['hooks', 'bench', 'shoes'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'hallway-mirror',
    name: 'С зеркалом в рост',
    hint: 'Зеркало 400 × 1400 рядом с вешалкой',
    zone: 'hallway',
    layout: 'linear',
    minLengthMm: 1400,
    maxLengthMm: 3200,
    appliances: [],
    tallSide: 'left',
    sections: ['mirror', 'hooks', 'shoes'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'hallway-mezzanine',
    name: 'С антресолью',
    hint: 'Верх под сезонное, низ под обувь',
    zone: 'hallway',
    layout: 'linear',
    minLengthMm: 1600,
    maxLengthMm: 3600,
    appliances: [],
    tallSide: 'left',
    sections: ['shelves', 'hooks', 'shoes', 'mezzanine'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'hallway-narrow',
    name: 'Узкая прихожая',
    hint: 'Для коридора, где не развернуться',
    zone: 'hallway',
    layout: 'linear',
    minLengthMm: 1000,
    maxLengthMm: 2000,
    appliances: [],
    tallSide: 'left',
    sections: ['hooks', 'shoes'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },

  /* ─────────────  Зал: ТВ-зона  ───────────── */
  {
    id: 'living-tv',
    name: 'ТВ-зона с нишей',
    hint: 'Ниша под телевизор, подвесные модули, подсветка',
    zone: 'living',
    layout: 'linear',
    // ниша под ТВ и два подвесных модуля занимают 2200 мм
    minLengthMm: 2200,
    maxLengthMm: 4500,
    appliances: [],
    tallSide: 'left',
    sections: ['hanging_module', 'tv_niche', 'hanging_module', 'drawers'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'living-storage',
    name: 'ТВ-зона с хранением',
    hint: 'Ниша, ящики снизу и открытые полки по краям',
    zone: 'living',
    layout: 'linear',
    minLengthMm: 2400,
    maxLengthMm: 5000,
    appliances: [],
    tallSide: 'left',
    sections: ['open', 'tv_niche', 'drawers', 'drawers', 'open'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },

  {
    id: 'living-shelves',
    name: 'Ниша и открытые полки',
    hint: 'Лёгкий вариант: минимум закрытого',
    zone: 'living',
    layout: 'linear',
    minLengthMm: 2000,
    maxLengthMm: 4500,
    appliances: [],
    tallSide: 'left',
    sections: ['open', 'tv_niche', 'open'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'living-hanging',
    name: 'Подвесная композиция',
    hint: 'Всё висит на стене, пол свободен',
    zone: 'living',
    layout: 'linear',
    minLengthMm: 2200,
    maxLengthMm: 4500,
    appliances: [],
    tallSide: 'left',
    sections: ['hanging_module', 'tv_niche', 'hanging_module'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },

  /* ─────────────  Санузел  ───────────── */
  {
    id: 'bath-vanity',
    name: 'Тумба и пенал',
    hint: 'Тумба под раковину, пенал под химию',
    zone: 'bathroom',
    layout: 'linear',
    minLengthMm: 900,
    maxLengthMm: 2400,
    appliances: [],
    tallSide: 'left',
    sections: ['vanity', 'tall_unit'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'bath-mirror',
    name: 'Тумба с зеркальным шкафом',
    hint: 'Тумба, зеркальный шкаф с подсветкой, пенал',
    zone: 'bathroom',
    layout: 'linear',
    // тумба, зеркальный шкаф и пенал занимают 1300 мм
    minLengthMm: 1300,
    maxLengthMm: 2800,
    appliances: [],
    tallSide: 'left',
    sections: ['vanity', 'mirror_cabinet', 'tall_unit'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'bath-drawers',
    name: 'Тумба с ящиками',
    hint: 'Ящики вместо дверец: видно всё сразу',
    zone: 'bathroom',
    layout: 'linear',
    minLengthMm: 900,
    maxLengthMm: 2000,
    appliances: [],
    tallSide: 'left',
    sections: ['vanity', 'drawers'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
  {
    id: 'bath-open',
    name: 'Тумба и открытая ниша',
    hint: 'Полотенца на виду',
    zone: 'bathroom',
    layout: 'linear',
    minLengthMm: 800,
    maxLengthMm: 1800,
    appliances: [],
    tallSide: 'left',
    sections: ['vanity', 'open'],
    doorSystem: 'hinged',
    options: { hasUpper: false },
  },
];

export const TEMPLATE_LAYOUT_LABEL: Record<RunLayout, string> = {
  linear: 'Прямая',
  corner_l: 'Угловая',
  u_shape: 'П-образная',
};

/**
 * Готова ли зона по-настоящему.
 *
 * Пометка «в разработке» снимается не решением, а фактом: у зоны есть свои
 * секции, свои строки сметы и хотя бы два шаблона. Считаем это здесь, а не
 * держим флагом в профиле: флаг легко забыть переключить, и продукт начнёт
 * обещать посчитанный шкаф-купе, которого нет.
 */
export function zoneReadiness(zone: ZoneKind): { ready: boolean; missing: string[] } {
  const profile = zoneProfile(zone);
  const missing: string[] = [];

  if (zone !== 'kitchen' && profile.sections.length === 0) missing.push('состав секций');
  if (templatesForZone(zone).length < 2) missing.push('типовые решения');

  return { ready: missing.length === 0, missing };
}

/** Шаблоны своей зоны. Кухонные в спальне не показываем вовсе. */
export function templatesForZone(
  zone: ZoneKind | undefined | null,
  extra: RunTemplate[] = [],
): RunTemplate[] {
  const target = zone ?? 'kitchen';
  return [...extra, ...RUN_TEMPLATES].filter((t) => (t.zone ?? 'kitchen') === target);
}

/** Подходит ли шаблон под замеренную длину. */
export function templateFits(template: RunTemplate, lengthMm: number): boolean {
  return lengthMm >= template.minLengthMm && lengthMm <= template.maxLengthMm;
}

/**
 * Почему шаблон недоступен — словами, а не серой карточкой без объяснения.
 * Пустая строка означает, что шаблон подходит.
 */
export function templateBlockedReason(template: RunTemplate, lengthMm: number): string {
  if (lengthMm <= 0) return 'Сначала внесите длину стены';
  if (lengthMm < template.minLengthMm) return `Нужен ряд от ${template.minLengthMm} мм`;
  if (lengthMm > template.maxLengthMm) return `Рассчитан на ряд до ${template.maxLengthMm} мм`;
  return '';
}

/**
 * Минимальная длина, в которую физически влезает шаблон.
 *
 * У кухни её задаёт техника: духовку 600 мм не сузить. У остальных зон —
 * минимальные ширины секций. Карточка, обещающая ряд короче этой суммы,
 * не соберётся, и обещать его нельзя.
 */
export function templateAppliancesWidthMm(template: RunTemplate): number {
  if (template.sections?.length) {
    return template.sections
      .filter((kind) => kind !== 'mezzanine')
      .reduce((sum, kind) => sum + sectionSpec(kind).minWidthMm, 0);
  }

  /*
   * Считает та же функция, что и раскладка: духовка с микроволновкой
   * занимают ОДИН пенал, и шаблон, посчитавший их двумя, потребовал бы
   * лишние 600 мм стены — и выключился бы там, где всё помещается.
   */
  return applianceRowWidthMm(template.appliances);
}

/**
 * Шаблон → требования к ряду. Дальше всё как обычно: `buildRun` сажает
 * технику на стандартные ширины, разрешает коллизии и считает смету.
 */
export function requirementsFromTemplate(
  template: RunTemplate,
  base: RunOptions = DEFAULT_OPTIONS,
): RunRequirements {
  const zone = template.zone ?? 'kitchen';
  const profile = zoneProfile(zone);

  return {
    zone,
    sections: template.sections ? [...template.sections] : undefined,
    doorSystem: template.doorSystem ?? profile.doorSystem,
    glassDisplay: template.glassDisplay,
    appliances: [...template.appliances],
    tallSide: template.tallSide,
    options: { ...base, ...template.options },
    /*
     * Опции решения — это ВЫБОР ЧЕЛОВЕКА, а не умолчание: он нажал
     * «До потолка», и комплектация не вправе вернуть обычную высоту.
     *
     * Без этого карточка «До потолка» собиралась ровно тем же рядом, что
     * «Прямая стандартная»: стратегия `optimal` перекрывала опцию своей,
     * и два разных решения давали одну мебель и одну цену.
     */
    lockedOptions: Object.keys(template.options ?? {}) as (keyof RunOptions)[],
  };
}

/** Что предложить первым: самый подходящий по длине в своей зоне. */
export function suggestTemplate(
  lengthMm: number,
  zone: ZoneKind | undefined | null = 'kitchen',
  /** Решения компании: они идут первыми и здесь тоже. */
  extra: RunTemplate[] = [],
): RunTemplate | null {
  const fitting = templatesForZone(zone, extra).filter((t) => templateFits(t, lengthMm));
  if (fitting.length === 0) return null;

  // Ближе к середине своего диапазона — значит ряд для шаблона типичный.
  return fitting.reduce((best, t) => {
    const center = (x: RunTemplate) => Math.abs(lengthMm - (x.minLengthMm + x.maxLengthMm) / 2);
    return center(t) < center(best) ? t : best;
  });
}

export function templateById(
  id: string | null | undefined,
  extra: RunTemplate[] = [],
): RunTemplate | null {
  return [...extra, ...RUN_TEMPLATES].find((t) => t.id === id) ?? null;
}

/**
 * Шаблоны компании поверх встроенных. Хранятся в `orgs.run_templates`
 * и приезжают с сервера: «наша базовая на 2700 без посудомойки» — это
 * типовое решение компании, а не платформы.
 */
export function parseOrgTemplates(raw: unknown): RunTemplate[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item): RunTemplate[] => {
    const t = item as Partial<RunTemplate>;
    const appliances = Array.isArray(t.appliances)
      ? t.appliances.filter((a): a is ApplianceKind => a in APPLIANCE_SLOTS)
      : [];

    const sections = Array.isArray(t.sections)
      ? t.sections.filter((kind): kind is SectionKind => kind in SECTION_SPECS)
      : [];

    /*
     * Решение живёт либо техникой (кухня), либо секциями (шкаф). Раньше
     * требовалась только техника — и своё решение для спальни молча
     * пропадало при сохранении.
     */
    if (!t.id || !t.name) return [];
    if (appliances.length === 0 && sections.length === 0) return [];

    const minLengthMm = Number(t.minLengthMm);
    const maxLengthMm = Number(t.maxLengthMm);
    if (!Number.isFinite(minLengthMm) || !Number.isFinite(maxLengthMm)) return [];
    if (maxLengthMm <= minLengthMm) return [];

    return [
      {
        id: `org:${t.id}`,
        name: String(t.name),
        hint: String(t.hint ?? 'Типовое решение компании'),
        layout: (['linear', 'corner_l', 'u_shape'] as RunLayout[]).includes(t.layout as RunLayout)
          ? (t.layout as RunLayout)
          : 'linear',
        minLengthMm: Math.round(minLengthMm),
        maxLengthMm: Math.round(maxLengthMm),
        zone: (ZONE_ORDER as ZoneKind[]).includes(t.zone as ZoneKind)
          ? (t.zone as ZoneKind)
          : 'kitchen',
        appliances,
        sections: sections.length > 0 ? sections : undefined,
        doorSystem: t.doorSystem === 'sliding' ? 'sliding' : t.doorSystem === 'hinged' ? 'hinged' : undefined,
        glassDisplay: t.glassDisplay === true ? true : undefined,
        tallSide: t.tallSide === 'right' ? 'right' : 'left',
        options: t.options,
      },
    ];
  });
}
