import { DELIVERY_KEY } from './estimate';
import type { Estimate, EstimateLine } from '@/types/millwork';

/**
 * СМЕТА В ПЯТЬ СТРОК.
 *
 * Полная смета — это тридцать позиций: кромка ПВХ, эксцентрики, опоры,
 * распил. Клиенту на встрече они не говорят ничего, зато создают чувство,
 * что его считают по мелочам и где-то там спрятана наценка. Мебельщик
 * показывает пять цифр: корпус и фасады, столешница и фартук, фурнитура,
 * техника, доставка и монтаж.
 *
 * Подробный вид со ставками никуда не делся — он открывается кнопкой
 * «Подробно» и печатается. Это одна и та же смета: группы не считают
 * ничего заново, а только складывают строки, поэтому сумма групп РАВНА
 * итогу до тенге.
 */

export type EstimateGroupKey =
  | 'body'
  | 'surfaces'
  | 'hardware'
  | 'appliances'
  | 'delivery';

export type EstimateGroup = {
  key: EstimateGroupKey;
  title: string;
  /** Одна строка о том, что внутри: клиент не должен гадать. */
  hint: string;
  total: number;
  lines: EstimateLine[];
};

const GROUP_TITLE: Record<EstimateGroupKey, { title: string; hint: string }> = {
  body: {
    title: 'Корпус и фасады',
    hint: 'ЛДСП, задние стенки, фасады, кромка, распил',
  },
  surfaces: {
    title: 'Столешница и фартук',
    hint: 'Столешница, запил, плинтус, стеновая панель',
  },
  hardware: {
    title: 'Фурнитура',
    hint: 'Петли, направляющие, подъёмники, ручки, опоры, крепёж',
  },
  appliances: {
    title: 'Техника',
    hint: 'Встраиваемые приборы, мойка, смеситель',
  },
  delivery: {
    title: 'Доставка и монтаж',
    hint: 'Выезд бригады, сборка на объекте',
  },
};

/**
 * Куда попадает статья.
 *
 * Ключи, а не названия: название меняют, ключ живёт в сохранённых сметах.
 * Неизвестная статья идёт в корпус — это самая большая группа, и там она
 * не потеряется в глазах клиента; в подробном виде она видна как есть.
 */
function groupOf(line: EstimateLine): EstimateGroupKey {
  const key = line.key;

  if (key === DELIVERY_KEY) return 'delivery';
  if (key.startsWith('appliance_') || key === 'sink_base' || key === 'faucet') {
    return 'appliances';
  }
  if (
    key.startsWith('countertop_') ||
    key === 'wall_panel' ||
    key === 'sink_cutout' ||
    key === 'mirror_panel'
  ) {
    return 'surfaces';
  }
  if (
    key.startsWith('hinge_') ||
    key.startsWith('slide_') ||
    key.startsWith('handle_') ||
    key === 'lift_mechanism' ||
    key === 'leg_support' ||
    key === 'fasteners' ||
    key === 'sliding_system' ||
    key === 'wardrobe_rod' ||
    key === 'rod_holder' ||
    key === 'rod_pantograph' ||
    key === 'drawer_box' ||
    key === 'coat_hook' ||
    key === 'shoe_rack' ||
    key === 'hanging_bracket' ||
    key === 'cable_channel' ||
    key === 'led_niche' ||
    key === 'led_display'
  ) {
    return 'hardware';
  }

  return 'body';
}

export const GROUP_ORDER: EstimateGroupKey[] = [
  'body',
  'surfaces',
  'hardware',
  'appliances',
  'delivery',
];

/**
 * Пять групп сметы.
 *
 * Считаются ТОЛЬКО из строк сметы: выключенная галочкой строка не входит
 * ни в группу, ни в итог. Пустые группы не показываются вовсе — «Техника:
 * 0 ₸» в шкафу-купе читается как забытая позиция.
 */
export function estimateGroups(estimate: Estimate): EstimateGroup[] {
  const buckets = new Map<EstimateGroupKey, EstimateLine[]>();
  for (const key of GROUP_ORDER) buckets.set(key, []);

  for (const line of estimate.lines) {
    buckets.get(groupOf(line))?.push(line);
  }

  return GROUP_ORDER.map((key) => {
    const lines = buckets.get(key) ?? [];
    return {
      key,
      ...GROUP_TITLE[key],
      lines,
      total: lines.reduce((sum, line) => sum + (line.enabled ? line.total : 0), 0),
    };
  }).filter((group) => group.lines.length > 0);
}

/** Сумма групп обязана сходиться с итогом сметы до тенге. */
export function groupsTotal(groups: EstimateGroup[]): number {
  return groups.reduce((sum, group) => sum + group.total, 0);
}
