import type { CatalogEntryFull } from '@/types/catalog';
import type { RateTable } from './estimate';

/**
 * Ставки сметы приходят из каталога организации, а не из кода: у каждой
 * компании своя себестоимость. Товар попадает в расчёт по `meta.estimateKey` —
 * пока ключ не проставлен, строка не считается.
 */
export function ratesFromCatalog(items: CatalogEntryFull[]): RateTable {
  const rates: RateTable = {};
  for (const item of items) {
    const key = String(item.meta?.estimateKey ?? '').trim();
    if (key) rates[key] = item.price;
  }
  return rates;
}

/** Статьи, без которых смета бессмысленна. */
export const REQUIRED_RATE_KEYS = [
  'ldsp_carcass',
  'front_panel',
  'pvc_edge',
  'countertop_ldsp',
] as const;

export function missingRequiredRates(rates: RateTable): string[] {
  return REQUIRED_RATE_KEYS.filter((key) => rates[key] === undefined);
}

/**
 * Типовой прайс для быстрого старта.
 *
 * Это ОРИЕНТИР, а не цены компании: интерфейс обязан говорить об этом прямо.
 * Средние ставки по рынку нужны, чтобы новый пользователь увидел работающую
 * смету в первый визит, а не упёрся в пустой каталог.
 */
export type TypicalRate = {
  estimateKey: string;
  article: string;
  name: string;
  categoryKey: string;
  unit: 'm2' | 'piece' | 'running_meter' | 'set';
  price: number;
};

export const TYPICAL_PRICE_LIST: TypicalRate[] = [
  { estimateKey: 'ldsp_carcass', article: 'MAT-LDSP-16', name: 'Корпус ЛДСП 16 мм', categoryKey: 'materials', unit: 'm2', price: 9500 },
  { estimateKey: 'hdf_back', article: 'MAT-HDF-3', name: 'Задняя стенка ХДФ 3 мм', categoryKey: 'materials', unit: 'm2', price: 2200 },
  { estimateKey: 'front_panel', article: 'MAT-FRONT-MDF', name: 'Фасад МДФ эмаль', categoryKey: 'materials', unit: 'm2', price: 26000 },
  { estimateKey: 'pvc_edge', article: 'MAT-EDGE-PVC', name: 'Кромка ПВХ 2 мм', categoryKey: 'materials', unit: 'running_meter', price: 450 },
  { estimateKey: 'countertop_ldsp', article: 'TOP-LDSP-38', name: 'Столешница ЛДСП 38 мм', categoryKey: 'countertops', unit: 'running_meter', price: 18000 },
  { estimateKey: 'countertop_quartz', article: 'TOP-QUARTZ', name: 'Столешница кварцевый агломерат', categoryKey: 'countertops', unit: 'running_meter', price: 95000 },
  { estimateKey: 'countertop_solid_wood', article: 'TOP-WOOD', name: 'Столешница массив дуба', categoryKey: 'countertops', unit: 'running_meter', price: 140000 },
  { estimateKey: 'countertop_miter', article: 'TOP-MITER', name: 'Запил столешницы на угол', categoryKey: 'countertops', unit: 'piece', price: 25000 },
  { estimateKey: 'countertop_plinth', article: 'TOP-PLINTH', name: 'Плинтус столешницы', categoryKey: 'countertops', unit: 'running_meter', price: 2500 },
  { estimateKey: 'wall_panel', article: 'TOP-APRON', name: 'Стеновая панель (фартук)', categoryKey: 'countertops', unit: 'running_meter', price: 14000 },
  { estimateKey: 'hinge_standard', article: 'HW-HINGE-STD', name: 'Петля стандарт', categoryKey: 'hardware', unit: 'piece', price: 900 },
  { estimateKey: 'hinge_soft_close', article: 'HW-HINGE-SC', name: 'Петля с доводчиком', categoryKey: 'hardware', unit: 'piece', price: 1800 },
  { estimateKey: 'hinge_blum', article: 'HW-HINGE-BLUM', name: 'Петля Blum', categoryKey: 'hardware', unit: 'piece', price: 3400 },
  { estimateKey: 'slide_standard', article: 'HW-SLIDE-STD', name: 'Направляющие стандарт', categoryKey: 'hardware', unit: 'set', price: 3200 },
  { estimateKey: 'slide_soft_close', article: 'HW-SLIDE-SC', name: 'Направляющие с доводчиком', categoryKey: 'hardware', unit: 'set', price: 6500 },
  { estimateKey: 'slide_blum', article: 'HW-SLIDE-BLUM', name: 'Направляющие Blum Tandembox', categoryKey: 'hardware', unit: 'set', price: 14000 },
  { estimateKey: 'lift_mechanism', article: 'HW-LIFT', name: 'Подъёмник верхнего фасада', categoryKey: 'hardware', unit: 'piece', price: 7800 },
  { estimateKey: 'handle_standard', article: 'HW-HANDLE', name: 'Ручка накладная', categoryKey: 'hardware', unit: 'piece', price: 1200 },
  { estimateKey: 'handle_integrated', article: 'HW-HANDLE-PROFILE', name: 'Ручка-профиль', categoryKey: 'hardware', unit: 'running_meter', price: 6500 },
  { estimateKey: 'leg_support', article: 'HW-LEG', name: 'Опора регулируемая', categoryKey: 'hardware', unit: 'piece', price: 300 },
  { estimateKey: 'fasteners', article: 'HW-FASTENERS', name: 'Крепёж и эксцентрики (% от корпуса)', categoryKey: 'hardware', unit: 'piece', price: 12 },
  { estimateKey: 'cutting', article: 'SRV-CUT', name: 'Распил и присадка', categoryKey: 'services', unit: 'm2', price: 1800 },
  { estimateKey: 'cornice', article: 'SRV-CORNICE', name: 'Антресоль до потолка', categoryKey: 'services', unit: 'running_meter', price: 12000 },
  { estimateKey: 'delivery_install', article: 'SRV-DELIVERY', name: 'Доставка и монтаж (% от подытога)', categoryKey: 'services', unit: 'piece', price: 8 },
  { estimateKey: 'faucet', article: 'APP-FAUCET', name: 'Смеситель', categoryKey: 'appliances', unit: 'piece', price: 45000 },
  { estimateKey: 'appliance_sink600', article: 'APP-SINK-600', name: 'Мойка 600', categoryKey: 'appliances', unit: 'piece', price: 38000 },
  { estimateKey: 'appliance_sink800', article: 'APP-SINK-800', name: 'Мойка 800', categoryKey: 'appliances', unit: 'piece', price: 52000 },
  { estimateKey: 'appliance_hob', article: 'APP-HOB', name: 'Варочная панель', categoryKey: 'appliances', unit: 'piece', price: 120000 },
  { estimateKey: 'appliance_oven', article: 'APP-OVEN', name: 'Духовой шкаф', categoryKey: 'appliances', unit: 'piece', price: 180000 },
  { estimateKey: 'appliance_hood', article: 'APP-HOOD', name: 'Вытяжка', categoryKey: 'appliances', unit: 'piece', price: 65000 },
  { estimateKey: 'appliance_fridge', article: 'APP-FRIDGE', name: 'Холодильник', categoryKey: 'appliances', unit: 'piece', price: 320000 },
  { estimateKey: 'appliance_dishwasher45', article: 'APP-DW-45', name: 'Посудомойка 45', categoryKey: 'appliances', unit: 'piece', price: 210000 },
  { estimateKey: 'appliance_dishwasher60', article: 'APP-DW-60', name: 'Посудомойка 60', categoryKey: 'appliances', unit: 'piece', price: 250000 },
  { estimateKey: 'appliance_microwave', article: 'APP-MICROWAVE', name: 'Микроволновка', categoryKey: 'appliances', unit: 'piece', price: 90000 },
];

export const TYPICAL_CATEGORIES = [
  { key: 'materials', name: 'Материалы', appliesTo: 'object' as const, unit: 'm2' as const },
  { key: 'countertops', name: 'Столешницы и панели', appliesTo: 'object' as const, unit: 'running_meter' as const },
  { key: 'hardware', name: 'Фурнитура', appliesTo: 'object' as const, unit: 'piece' as const },
  { key: 'services', name: 'Услуги', appliesTo: 'object' as const, unit: 'piece' as const },
  { key: 'appliances', name: 'Техника', appliesTo: 'object' as const, unit: 'piece' as const },
];
