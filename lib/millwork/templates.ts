import { APPLIANCE_SLOTS } from './modules';
import type { ApplianceKind, RunOptions, RunRequirements } from '@/types/millwork';

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
  layout: RunLayout;
  minLengthMm: number;
  maxLengthMm: number;
  appliances: ApplianceKind[];
  tallSide: 'left' | 'right';
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
];

export const TEMPLATE_LAYOUT_LABEL: Record<RunLayout, string> = {
  linear: 'Прямая',
  corner_l: 'Угловая',
  u_shape: 'П-образная',
};

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

/** Минимальная длина, в которую физически влезает техника шаблона. */
export function templateAppliancesWidthMm(template: RunTemplate): number {
  return template.appliances
    .filter((a) => APPLIANCE_SLOTS[a].kind !== 'upper')
    .reduce((sum, a) => sum + APPLIANCE_SLOTS[a].widthMm, 0);
}

/**
 * Шаблон → требования к ряду. Дальше всё как обычно: `buildRun` сажает
 * технику на стандартные ширины, разрешает коллизии и считает смету.
 */
export function requirementsFromTemplate(
  template: RunTemplate,
  base: RunOptions = DEFAULT_OPTIONS,
): RunRequirements {
  return {
    appliances: [...template.appliances],
    tallSide: template.tallSide,
    options: { ...base, ...template.options },
  };
}

/** Что предложить первым: самый подходящий по длине. */
export function suggestTemplate(lengthMm: number): RunTemplate | null {
  const fitting = RUN_TEMPLATES.filter((t) => templateFits(t, lengthMm));
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
