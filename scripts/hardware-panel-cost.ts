/**
 * ЦЕНА ПАНЕЛИ ФУРНИТУРЫ ПО ЧАСТЯМ (HARDWARE-PHOTO-PERF-01) — диагностика:
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/hardware-panel-cost.ts`.
 *
 * Меряет на 1199 позициях фактов то, что панель считает при открытии и на
 * каждой прокрутке: разбор каталога, факты списка (фото, 3D), сортировку
 * названий, проверку совместимости по строке. Числа — мс на этой машине;
 * сравниваются между собой, а не с браузером.
 */
import { performance } from 'node:perf_hooks';
import { DEFAULT_PRODUCTION, type CatalogEntryFull } from '../types/catalog';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { mediaViews, listPhoto, hasDrawing, model3dStatusOf } from '../lib/millwork/hardwareMedia';
import { fittingSlotsOf, fittingVerdict, slotAccepts } from '../lib/millwork/fittings';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { allModules } from '../lib/millwork/layout';
import type { VariantKey } from '../types/millwork';

const rows = HARDWARE_FACTS.map((fact) => {
  const row = hardwareCatalogRow(fact);
  return { id: `hw:${fact.article}`, org_id: 'o', category_id: 'c', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '', price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: row.meta, is_active: true, assets: [] } as unknown as CatalogEntryFull;
});
const time = (label: string, fn: () => unknown, repeat = 5) => {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < repeat; i += 1) fn();
  const ms = (performance.now() - t0) / repeat;
  console.log(`${label.padEnd(58)} ${ms.toFixed(2)} мс`);
  return ms;
};

const catalog = hardwareCatalog(rows);
const all = Array.from(catalog.values());
time('разбор каталога hardwareCatalog (новый массив каждый раз)', () => hardwareCatalog([...rows]));
time('факты списка: изображения + статус 3D, 1199 позиций', () =>
  all.map((item) => {
    const views = mediaViews(rows[0]);
    return { photo: listPhoto(views), drawing: hasDrawing(views), model3d: model3dStatusOf(item) };
  }),
);
time('сортировка 1199 названий localeCompare(ru)', () => [...all].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
const collator = new Intl.Collator('ru');
time('сортировка 1199 названий Intl.Collator(ru)', () => [...all].sort((a, b) => collator.compare(a.name, b.name)));

const base = workspaceInput({ title: 'cost', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: DEFAULT_PRODUCTION, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: catalog });
const run = composeVariants(input, { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>, {}).find((v) => v.key === 'optimal')!.run;
const unit = allModules(run).find((m) => m.id === 'base-2700-hob@w1')!;
const place = fittingSlotsOf(unit, run, DEFAULT_PRODUCTION).find((p) => p.slot === 'slide')!;
const slides = all.filter((item) => slotAccepts('slide', item));
const one = time(`проверка совместимости: ${slides.length} направляющих на модуле под варочной`, () =>
  slides.map((item) => fittingVerdict({ unit, run, slot: place.slot, item, bayId: place.bayId, production: DEFAULT_PRODUCTION, catalog })),
) / slides.length;
console.log(`  на одну строку ${(one * 1000).toFixed(0)} мкс; 18–26 строк на кадр прокрутки — ${(one * 18).toFixed(1)}…${(one * 26).toFixed(1)} мс без кэша`);
