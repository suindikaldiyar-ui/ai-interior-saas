import type { CommPoint, Measurement, Opening, RunRequirements } from '@/types/millwork';
import type { RateTable } from './estimate';
import { DEFAULT_REQUIREMENTS } from './workspace';

/**
 * Демо-проект. Приложение никогда не открывается пустым: первое, что видит
 * человек, — готовая кухня с тремя посчитанными вариантами, а не пустой экран
 * с предложением что-нибудь ввести.
 *
 * Кухня 3200 мм: мойка под окном, посудомойка рядом, варочная с вытяжкой
 * за оконным пролётом, холодильник и духовая колонна в торце.
 *
 * Помещение Г-образное — вторая стена 1800 мм есть в замере. Конфигуратор
 * пока собирает ОДИН ряд, поэтому угловой модуль в него не заводится:
 * угол забирает 900 мм, и на технику осталось бы 2300 мм при потребности
 * 2850. Демонстрация не должна открываться с предупреждением о том, что
 * духовка не поместилась, — это витрина продукта.
 */

export const DEMO_OPENINGS: Opening[] = [
  {
    id: 'win-1',
    kind: 'window',
    fromCornerMm: 1200,
    widthMm: 1000,
    sillMm: 850,
    heightMm: 1400,
  },
];

export const DEMO_COMMS: CommPoint[] = [
  { id: 'c-water', kind: 'water_supply', wallId: 'w1', fromCornerMm: 1700, heightMm: 400, note: 'вывод под мойку' },
  { id: 'c-sewer', kind: 'sewer', wallId: 'w1', fromCornerMm: 1720, heightMm: 300 },
  { id: 'c-vent', kind: 'ventilation', wallId: 'w1', fromCornerMm: 2750, heightMm: 2250 },
  { id: 'c-sock-1', kind: 'socket', wallId: 'w1', fromCornerMm: 300, heightMm: 1100, note: 'холодильник' },
  { id: 'c-sock-2', kind: 'socket', wallId: 'w1', fromCornerMm: 900, heightMm: 600, note: 'духовой шкаф' },
  { id: 'c-sock-3', kind: 'socket', wallId: 'w1', fromCornerMm: 2750, heightMm: 1100, note: 'варочная и вытяжка' },
  { id: 'c-sock-4', kind: 'socket', wallId: 'w1', fromCornerMm: 2225, heightMm: 600, note: 'посудомойка' },
];

export const DEMO_MEASUREMENT: Measurement = {
  id: 'demo',
  ceilingHeightMm: 2700,
  walls: [
    { id: 'w1', lengthMm: 3200, angleDeg: 90, openings: DEMO_OPENINGS },
    { id: 'w2', lengthMm: 1800, angleDeg: 90, openings: [] },
  ],
  comms: DEMO_COMMS,
  photos: [],
  measuredBy: 'Ержан',
  measuredAt: '2026-08-20',
  notes: 'ЖК Апельсин, кв. 42. Короб в углу не мешает.',
};

export const DEMO_REQUIREMENTS: RunRequirements = DEFAULT_REQUIREMENTS;

/**
 * Ставки демо-каталога. В рабочем проекте они приходят из catalog_items
 * организации: у каждой компании своя себестоимость, в коде её быть не должно.
 */
export const DEMO_RATES: RateTable = {
  // Зоны кроме кухни: без этих ставок смета спальни не считается.
  ldsp_moisture: 14500,
  countertop_moisture: 42000,
  sliding_door: 38000,
  sliding_system: 42000,
  wardrobe_rod: 4500,
  rod_holder: 1200,
  rod_pantograph: 26000,
  shelf_panel: 11000,
  drawer_box: 14000,
  coat_hook: 1500,
  shoe_rack: 9000,
  bench_seat: 38000,
  mirror_panel: 32000,
  hanging_bracket: 6500,
  cable_channel: 3500,
  led_niche: 8500,
  sink_cutout: 12000,
  // Витрина: стекло в раме и лента по контуру.
  glass_front: 48000,
  led_display: 9500,
  // Механизмы вариантов: карго, сушилка, подъёмник, карусель.
  cargo_150: 42000,
  cargo_300: 56000,
  cargo_tall: 145000,
  dish_dryer: 18000,
  lift_aventos: 24000,
  sink_base: 8000,
  carousel_corner: 78000,

  ldsp_carcass: 9500,
  hdf_back: 2200,
  front_panel: 26000,
  pvc_edge: 450,
  countertop_ldsp: 18000,
  countertop_quartz: 95000,
  countertop_solid_wood: 140000,
  countertop_miter: 25000,
  countertop_plinth: 2500,
  wall_panel: 14000,
  hinge_standard: 900,
  hinge_soft_close: 1800,
  hinge_blum: 3400,
  slide_standard: 3200,
  slide_soft_close: 6500,
  slide_blum: 14000,
  lift_mechanism: 7800,
  handle_standard: 1200,
  handle_integrated: 6500,
  leg_support: 300,
  fasteners: 12,
  cutting: 1800,
  cornice: 12000,
  faucet: 45000,
  appliance_sink600: 38000,
  appliance_sink800: 52000,
  appliance_hob: 120000,
  appliance_oven: 180000,
  appliance_fridge: 320000,
  appliance_hood: 65000,
  appliance_dishwasher45: 210000,
  appliance_dishwasher60: 250000,
  appliance_microwave: 90000,
  delivery_install: 8,
};

export const DEMO_PROJECT = {
  title: 'ЖК Апельсин, кв. 42',
  zone: 'Кухня',
  lengthMm: 3200,
  ceilingHeightMm: 2700,
  /** Угловой модуль сюда не заводится — см. комментарий к файлу. */
  cornerAt: null,
};
