import type { CommPoint, Measurement, Opening, RunRequirements } from '@/types/millwork';
import type { RateTable } from './estimate';

/**
 * Демо-проект. Приложение никогда не открывается пустым: первое, что видит
 * человек, — готовая кухня с тремя посчитанными вариантами, а не пустой экран
 * с предложением что-нибудь ввести.
 *
 * Кухня 3200 мм, Г-образная, мойка у окна, посудомойка, варочная,
 * духовая колонна и пенал.
 */

export const DEMO_OPENINGS: Opening[] = [
  {
    id: 'win-1',
    kind: 'window',
    fromCornerMm: 1400,
    widthMm: 1200,
    sillMm: 850,
    heightMm: 1400,
  },
];

export const DEMO_COMMS: CommPoint[] = [
  { id: 'c-water', kind: 'water_supply', wallId: 'w1', fromCornerMm: 1700, heightMm: 400, note: 'вывод под мойку' },
  { id: 'c-sewer', kind: 'sewer', wallId: 'w1', fromCornerMm: 1720, heightMm: 300 },
  { id: 'c-vent', kind: 'ventilation', wallId: 'w1', fromCornerMm: 2700, heightMm: 2250 },
  { id: 'c-sock-1', kind: 'socket', wallId: 'w1', fromCornerMm: 300, heightMm: 1100, note: 'холодильник' },
  { id: 'c-sock-2', kind: 'socket', wallId: 'w1', fromCornerMm: 900, heightMm: 600, note: 'духовой шкаф' },
  { id: 'c-sock-3', kind: 'socket', wallId: 'w1', fromCornerMm: 2700, heightMm: 1100, note: 'варочная и вытяжка' },
  { id: 'c-sock-4', kind: 'socket', wallId: 'w1', fromCornerMm: 2150, heightMm: 600, note: 'посудомойка' },
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

export const DEMO_REQUIREMENTS: RunRequirements = {
  appliances: ['fridge', 'oven', 'sink600', 'dishwasher45', 'hob', 'hood'],
  tallSide: 'left',
  options: {
    hasUpper: true,
    upperToCeiling: false,
    hardwareClass: 'standard',
    countertop: 'ldsp',
    hasCornice: false,
    integratedHandles: false,
  },
};

/**
 * Ставки демо-каталога. В рабочем проекте они приходят из catalog_items
 * организации: у каждой компании своя себестоимость, в коде её быть не должно.
 */
export const DEMO_RATES: RateTable = {
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
  cornerAt: 'end' as const,
};
