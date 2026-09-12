import { TYPICAL_PALETTE, typicalColorItem } from './palette';
import type { CatalogCategory, CatalogEntryFull } from '@/types/catalog';
import type { CommPoint, Measurement, Opening, RunRequirements } from '@/types/millwork';
import type { RateTable } from './estimate';
import { DEFAULT_REQUIREMENTS } from './workspace';

/**
 * Демо-проект. Приложение никогда не открывается пустым: первое, что видит
 * человек, — готовая кухня с тремя посчитанными вариантами, а не пустой экран
 * с предложением что-нибудь ввести.
 *
 * Кухня 3800 мм: холодильник и духовая колонна в левом торце, рабочая
 * поверхность, мойка под окном, посудомойка рядом с ней, варочная с
 * вытяжкой и шкаф в правом торце.
 *
 * ДЛИНА ВЫБРАНА ПОД ДЕМОНСТРАЦИЮ, а не наугад. На 3200 мм ряд забивался
 * техникой вплотную: все модули оказывались либо под прибор, либо узким
 * карго, и выбора не было НИ У ОДНОГО — лента вариантов на демонстрации
 * не показывалась вовсе. А это главный ход встречи: нажать на модуль,
 * поменять на витрину, показать новую сумму.
 *
 * Лишние 600 мм дают четыре верхних модуля и обычные нижние, у которых
 * выбор есть и он ВИДЕН: у шкафа в торце шесть разных рисунков фасада,
 * включая витрину с подсветкой. Кухня при этом осталась обычной —
 * подгонки под витрину возможностей мебельщик здесь не увидит.
 *
 * Число модулей с видимым выбором держит приёмка: `npm run test:millwork`
 * падает, если их станет меньше трёх.
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
    // Окно 900 мм — обычное кухонное. Мойка встаёт под него.
    fromCornerMm: 1500,
    widthMm: 900,
    sillMm: 850,
    heightMm: 1400,
  },
];

export const DEMO_COMMS: CommPoint[] = [
  // Вывод воды под окном: мойка садится напротив него.
  { id: 'c-water', kind: 'water_supply', wallId: 'w1', fromCornerMm: 1950, heightMm: 400, note: 'вывод под мойку' },
  { id: 'c-sewer', kind: 'sewer', wallId: 'w1', fromCornerMm: 1970, heightMm: 300 },
  // Вентканал над варочной: туда уходит вытяжка.
  { id: 'c-vent', kind: 'ventilation', wallId: 'w1', fromCornerMm: 3000, heightMm: 2250 },
  { id: 'c-sock-1', kind: 'socket', wallId: 'w1', fromCornerMm: 300, heightMm: 1100, note: 'холодильник' },
  { id: 'c-sock-2', kind: 'socket', wallId: 'w1', fromCornerMm: 900, heightMm: 600, note: 'духовой шкаф' },
  { id: 'c-sock-3', kind: 'socket', wallId: 'w1', fromCornerMm: 3000, heightMm: 1100, note: 'варочная и вытяжка' },
  { id: 'c-sock-4', kind: 'socket', wallId: 'w1', fromCornerMm: 2450, heightMm: 600, note: 'посудомойка' },
];

export const DEMO_MEASUREMENT: Measurement = {
  id: 'demo',
  ceilingHeightMm: 2700,
  walls: [
    { id: 'w1', lengthMm: 3800, angleDeg: 90, openings: DEMO_OPENINGS },
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
  hinge_corner_175: 2600,
  slide_standard: 3200,
  slide_soft_close: 6500,
  slide_blum: 14000,
  lift_mechanism: 7800,
  flap_mechanism: 9500,
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
  lengthMm: 3800,
  ceilingHeightMm: 2700,
  /** Угловой модуль сюда не заводится — см. комментарий к файлу. */
  cornerAt: null,
};

/**
 * КАТАЛОГ ДЕМОНСТРАЦИИ: ТИПОВАЯ ПАЛИТРА ЦЕЛИКОМ.
 *
 * У демонстрации нет организации, а палитра цветов читается из каталога
 * ОРГАНИЗАЦИИ (слой 34): каталог оставался пустым, и выбор цвета честно
 * писал «цветов не заведено». Правда — но на встрече это читается как
 * отсутствие функции.
 *
 * Берётся ТА ЖЕ типовая палитра, которую `seedTypicalCatalog` кладёт
 * компании в первый день, и вся целиком: двадцать позиций с пометкой
 * «типовая». Второго списка цветов в продукте нет и быть не должно —
 * иначе демо начнёт показывать не тот товар, который продают.
 *
 * Позиция каталога — это товар ЦЕЛИКОМ, вместе с категорией: `applies_to`
 * лежит на ней, и без категории чтение каталога падает в первом фильтре.
 */
const DEMO_CATEGORY: CatalogCategory = {
  id: 'demo-materials',
  org_id: 'demo',
  key: 'materials',
  name_ru: 'Материалы и цвета',
  name_kk: 'Материалы и цвета',
  applies_to: 'zone',
  unit: 'm2',
  sort_order: 0,
  is_active: true,
};

export const DEMO_CATALOG: CatalogEntryFull[] = TYPICAL_PALETTE.map((color, index) => {
  const seed = typicalColorItem(color);

  return {
    id: `demo-color-${index}`,
    org_id: 'demo',
    category_id: DEMO_CATEGORY.id,
    article: seed.article,
    name_ru: seed.name_ru,
    name_kk: seed.name_kk,
    description: '',
    price: seed.price,
    unit: seed.unit,
    dimensions: {},
    tiling: {},
    meta: seed.meta,
    is_active: true,
    category: DEMO_CATEGORY,
    assets: [],
  };
});
