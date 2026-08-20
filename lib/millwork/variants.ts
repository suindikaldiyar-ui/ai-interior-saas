import { buildRun, type BuildRunInput } from './layout';
import { buildEstimate, type RateTable } from './estimate';
import type { RunOptions, RunRequirements, Variant, VariantKey } from '@/types/millwork';

/**
 * Три варианта — это три СТРАТЕГИИ КОМПЛЕКТАЦИИ, а не три случайных результата.
 *
 * Раскладка у всех трёх одна и та же: клиент сравнивает одну свою кухню
 * в трёх бюджетах, а не три разные кухни. Решение принимается заметно быстрее,
 * потому что сравнивать нужно только цену и наполнение.
 */

export type VariantStrategy = {
  key: VariantKey;
  title: string;
  description: string;
  /** Чем стратегия перекрывает базовые опции ряда. */
  options: Partial<RunOptions>;
};

/**
 * Набор стратегий компания переопределяет в настройках: это её
 * ассортиментная политика, а не наше представление о прекрасном.
 */
export const DEFAULT_STRATEGIES: VariantStrategy[] = [
  {
    key: 'basic',
    title: 'Базовый',
    description: 'Минимум модулей, ЛДСП-столешница, фурнитура стандарт, без антресоли',
    options: {
      countertop: 'ldsp',
      hardwareClass: 'standard',
      upperToCeiling: false,
      hasCornice: false,
      integratedHandles: false,
    },
  },
  {
    key: 'optimal',
    title: 'Оптимальный',
    description: 'Верхний ряд стандартный, кварц, доводчики, встроенная мойка и варочная',
    options: {
      countertop: 'quartz',
      hardwareClass: 'soft_close',
      upperToCeiling: false,
      hasCornice: false,
      integratedHandles: false,
    },
  },
  {
    key: 'premium',
    title: 'Премиум',
    description: 'До потолка с антресолью, встроенная техника, Blum, подсветка, интегрированные ручки',
    options: {
      countertop: 'quartz',
      hardwareClass: 'blum',
      upperToCeiling: true,
      hasCornice: true,
      integratedHandles: true,
    },
  },
];

export interface BuildVariantsInput extends Omit<BuildRunInput, 'requirements'> {
  requirements: RunRequirements;
  rates: RateTable;
  strategies?: VariantStrategy[];
  disabledKeys?: Record<VariantKey, string[]>;
  calculatedAt?: string;
}

export function buildVariants(input: BuildVariantsInput): Variant[] {
  const strategies = input.strategies ?? DEFAULT_STRATEGIES;

  return strategies.map((strategy) => {
    const requirements: RunRequirements = {
  ...input.requirements,
   options: { ...(input.requirements?.options || {}), ...(strategy.options || {}) },
};

    const run = buildRun({ ...input, requirements, id: `${input.id ?? 'run'}-${strategy.key}` });

    const estimate = buildEstimate(
      run,
      strategy.key,
      input.rates,
      input.disabledKeys?.[strategy.key] ?? [],
      input.calculatedAt,
    );

    return {
      key: strategy.key,
      title: strategy.title,
      description: strategy.description,
      run,
      estimate,
    };
  });
}

export function findVariant(variants: Variant[], key: VariantKey): Variant | null {
  return variants.find((v) => v.key === key) ?? null;
}
