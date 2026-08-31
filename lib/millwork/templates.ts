import { APPLIANCE_SLOTS } from './modules';
import { applianceRowWidthMm } from './layout';
import { sectionSpec } from './sections';
import { zoneProfile } from './zones';
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
    appliances: [...template.appliances],
    tallSide: template.tallSide,
    options: { ...base, ...template.options },
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

    if (!t.id || !t.name || appliances.length === 0) return [];

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
        appliances,
        tallSide: t.tallSide === 'right' ? 'right' : 'left',
        options: t.options,
      },
    ];
  });
}
