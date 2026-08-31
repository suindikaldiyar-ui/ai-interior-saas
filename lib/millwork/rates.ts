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
  /* ── Зоны кроме кухни: шкаф-купе, прихожая, ТВ-зона, санузел ── */
  { estimateKey: 'ldsp_moisture', article: 'MAT-LDSP-WET', name: 'Корпус влагостойкий ЛДСП 16 мм', categoryKey: 'materials', unit: 'm2', price: 14500 },
  { estimateKey: 'countertop_moisture', article: 'TOP-WET', name: 'Столешница влагостойкая', categoryKey: 'countertops', unit: 'running_meter', price: 42000 },
  { estimateKey: 'sliding_door', article: 'WRD-DOOR', name: 'Полотно двери-купе', categoryKey: 'wardrobe', unit: 'm2', price: 38000 },
  { estimateKey: 'sliding_system', article: 'WRD-SYS', name: 'Система купе на одну дверь', categoryKey: 'wardrobe', unit: 'set', price: 42000 },
  { estimateKey: 'wardrobe_rod', article: 'WRD-ROD', name: 'Штанга для одежды', categoryKey: 'wardrobe', unit: 'running_meter', price: 4500 },
  { estimateKey: 'rod_holder', article: 'WRD-ROD-HOLD', name: 'Держатель штанги', categoryKey: 'wardrobe', unit: 'piece', price: 1200 },
  { estimateKey: 'rod_pantograph', article: 'WRD-PANTO', name: 'Штанга торцевая или пантограф', categoryKey: 'wardrobe', unit: 'set', price: 26000 },
  { estimateKey: 'shelf_panel', article: 'WRD-SHELF', name: 'Полка ЛДСП', categoryKey: 'wardrobe', unit: 'm2', price: 11000 },
  { estimateKey: 'drawer_box', article: 'WRD-DRAWER', name: 'Ящик в сборе', categoryKey: 'wardrobe', unit: 'set', price: 14000 },
  { estimateKey: 'coat_hook', article: 'HAL-HOOK', name: 'Крючок', categoryKey: 'hallway', unit: 'piece', price: 1500 },
  { estimateKey: 'shoe_rack', article: 'HAL-SHOE', name: 'Обувница наклонная, ярус', categoryKey: 'hallway', unit: 'piece', price: 9000 },
  { estimateKey: 'bench_seat', article: 'HAL-BENCH', name: 'Скамья с мягким сиденьем', categoryKey: 'hallway', unit: 'piece', price: 38000 },
  { estimateKey: 'mirror_panel', article: 'HAL-MIRROR', name: 'Зеркало', categoryKey: 'hallway', unit: 'm2', price: 32000 },
  { estimateKey: 'hanging_bracket', article: 'LIV-BRACKET', name: 'Подвесной крепёж на модуль', categoryKey: 'living', unit: 'set', price: 6500 },
  { estimateKey: 'cable_channel', article: 'LIV-CABLE', name: 'Кабель-канал', categoryKey: 'living', unit: 'running_meter', price: 3500 },
  { estimateKey: 'led_niche', article: 'LIV-LED', name: 'Подсветка ниши LED', categoryKey: 'living', unit: 'running_meter', price: 8500 },
  { estimateKey: 'sink_cutout', article: 'BAT-CUTOUT', name: 'Вырез под раковину', categoryKey: 'bath', unit: 'piece', price: 12000 },
  { estimateKey: 'glass_front', article: 'DSP-GLASS', name: 'Стеклянная дверь в раме', categoryKey: 'materials', unit: 'm2', price: 48000 },
  /* Варианты мест: механизм идёт отдельной строкой, корпус у них обычный. */
  { estimateKey: 'cargo_150', article: 'HW-CARGO-150', name: 'Карго узкое (бутылочница)', categoryKey: 'hardware', unit: 'piece', price: 42000 },
  { estimateKey: 'cargo_300', article: 'HW-CARGO-300', name: 'Карго 300 мм', categoryKey: 'hardware', unit: 'piece', price: 56000 },
  { estimateKey: 'cargo_tall', article: 'HW-CARGO-TALL', name: 'Карго высокое (пенал)', categoryKey: 'hardware', unit: 'piece', price: 145000 },
  { estimateKey: 'dish_dryer', article: 'HW-DRYER', name: 'Сушилка в верхний шкаф', categoryKey: 'hardware', unit: 'piece', price: 18000 },
  { estimateKey: 'lift_aventos', article: 'HW-LIFT-AV', name: 'Подъёмник верхнего фасада (Aventos)', categoryKey: 'hardware', unit: 'piece', price: 24000 },
  { estimateKey: 'sink_base', article: 'MOD-SINK-BASE', name: 'Модуль под мойку (без дна, вырез)', categoryKey: 'services', unit: 'piece', price: 8000 },
  { estimateKey: 'carousel_corner', article: 'HW-CAROUSEL', name: 'Карусель угловая', categoryKey: 'hardware', unit: 'piece', price: 78000 },
  { estimateKey: 'led_display', article: 'DSP-LED', name: 'Подсветка витрины LED', categoryKey: 'hardware', unit: 'running_meter', price: 9500 },

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

export type TypicalCategory = {
  key: string;
  name: string;
  /**
   * Все типовые категории — `object`. Это статьи СМЕТЫ, а не поверхности:
   * пометь их `zone`, и двери-купе со штангой полезут в шаг «Материалы»
   * как товары на выбор клиенту.
   */
  appliesTo: 'object';
  unit: 'm2' | 'piece' | 'running_meter' | 'set';
};

/**
 * Категории типового прайса.
 *
 * КАЖДЫЙ `categoryKey` из `TYPICAL_PRICE_LIST` обязан быть здесь. Список
 * зон (спальня, прихожая, зал, санузел) появился позже прайса, и четыре
 * категории под них тогда не завели: загрузка падала целиком на
 * `category_id … violates not-null constraint`. Расхождение теперь ловит
 * `orphanTypicalRates` и приёмка `npm run test:catalog`.
 */
export const TYPICAL_CATEGORIES: TypicalCategory[] = [
  { key: 'materials', name: 'Материалы', appliesTo: 'object', unit: 'm2' },
  { key: 'countertops', name: 'Столешницы и панели', appliesTo: 'object', unit: 'running_meter' },
  { key: 'hardware', name: 'Фурнитура', appliesTo: 'object', unit: 'piece' },
  { key: 'services', name: 'Услуги', appliesTo: 'object', unit: 'piece' },
  { key: 'appliances', name: 'Техника', appliesTo: 'object', unit: 'piece' },
  // Зоны кроме кухни: шкаф-купе, прихожая, ТВ-зона, санузел.
  { key: 'wardrobe', name: 'Шкафы-купе и гардеробные', appliesTo: 'object', unit: 'm2' },
  { key: 'hallway', name: 'Прихожая', appliesTo: 'object', unit: 'piece' },
  { key: 'living', name: 'ТВ-зона', appliesTo: 'object', unit: 'running_meter' },
  { key: 'bath', name: 'Санузел', appliesTo: 'object', unit: 'piece' },
];

/**
 * Позиции прайса, для которых нет категории.
 *
 * В норме список пуст. Не пуст — значит прайс уехал вперёд категорий, и
 * загрузка на пустом каталоге упадёт на NOT NULL: товару некуда встать.
 */
export function orphanTypicalRates(): TypicalRate[] {
  const known = new Set(TYPICAL_CATEGORIES.map((c) => c.key));
  return TYPICAL_PRICE_LIST.filter((rate) => !known.has(rate.categoryKey));
}
