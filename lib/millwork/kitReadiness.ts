import type { HardwareItem, ProductionSettings } from '@/types/catalog';
import type { Module } from '@/types/millwork';
import { runnerGeometry } from './drawerBox';
import { installedItem, slotAccepts } from './fittings';
import { readyTwinFor } from './readyTwins';

/**
 * КОМПЛЕКТ СИСТЕМЫ ЯЩИКА — ЧТО НУЖНО, ЧТОБЫ ОН СОБРАЛСЯ И ПОЯВИЛСЯ В 3D (ТЗ 2026-11-02, «REAL ACCOUNT»).
 *
 * У временных организаций приёмки всё это делал сценарий: свежий импорт фактов, правила короба при
 * создании, импорт моделей. У настоящей организации — четыре независимых условия, и любое невыполненное
 * молча оставляет ящик без системы. Здесь они названы по шагам, с тем, куда идти; ни одного размера не
 * подставляется:
 *
 *   facts  — у ходовой и царг в каталоге есть NL и размеры системы (сведения производителя не устарели);
 *   sides  — царги той же серии и той же NL стоят на месте «Царги системы ящика» (из каталога — кнопками);
 *   rules  — правила короба цеха заданы («Настройки цеха» → «Короб ящика»): без них короб не строится;
 *   model  — у ходовой и царг есть модель реестра (`meta.twin`); готовая модель ALDIK — если она есть
 *            для этого артикула, иначе — импорт CAD; без модели сцена рисует сечение профиля.
 */

export type KitStep = {
  key: 'facts' | 'sides' | 'rules' | 'model';
  ok: boolean;
  title: string;
  words: string;
  href?: string;
  /** Царги, которые подходят к этой ходовой (та же серия, та же NL), — из каталога организации. */
  offers?: HardwareItem[];
};

const nlOf = (item: HardwareItem | null | undefined): number | null => {
  const v = item?.hardware.dimensionsMm?.nominalLength;
  return typeof v === 'number' && v > 0 ? v : null;
};
const SYSTEM_DIMS = ['sideHeight', 'bottomWidthDeduct', 'bottomLengthDeduct', 'backWidthDeduct', 'backHeight'];
const short = (item: HardwareItem) => item.article.replace(/^MFR-[A-Z]+-/, '');

export function drawerSystemKit(unit: Module, production: ProductionSettings, hardware: Map<string, HardwareItem>): KitStep[] | null {
  const runner = installedItem(unit, 'slide', hardware);
  if (!runner || runnerGeometry(runner).mount !== 'system') return null;
  const side = installedItem(unit, 'drawer_side', hardware);
  const runnerNl = nlOf(runner);
  const sideNl = nlOf(side);
  const sideDimsMissing = side ? SYSTEM_DIMS.filter((key) => typeof side.hardware.dimensionsMm?.[key] !== 'number') : [];

  const steps: KitStep[] = [];
  const staleWords = [
    runnerNl === null ? `у ходовой ${short(runner)} нет NL` : null,
    side && sideNl === null ? `у царг ${short(side)} нет NL` : null,
    side && sideDimsMissing.length > 0 ? `у царг ${short(side)} нет размеров системы (высота царги, вычеты дна и задней стенки)` : null,
  ].filter(Boolean);
  steps.push(
    staleWords.length === 0
      ? { key: 'facts', ok: true, title: 'Сведения производителя', words: `NL ${runnerNl} мм и размеры системы — в каталоге` }
      : {
          key: 'facts',
          ok: false,
          title: 'Сведения производителя',
          words: `в каталоге организации ${staleWords.join('; ')} — сведения импортированы раньше, чем появились в своде. «Каталог» → «Фурнитура производителей» → «Загрузить»: цены и названия компании не меняются`,
          href: '/admin/catalog',
        },
  );

  const offers =
    runnerNl === null
      ? []
      : Array.from(hardware.values())
          .filter((item) => item.active !== false && slotAccepts('drawer_side', item) && item.hardware.series === runner.hardware.series && nlOf(item) === runnerNl)
          .sort((a, b) => a.article.localeCompare(b.article));
  const sidesOk = Boolean(side) && runnerNl !== null && sideNl === runnerNl;
  steps.push(
    sidesOk
      ? { key: 'sides', ok: true, title: 'Царги', words: `${short(side!)} — та же NL ${runnerNl} мм` }
      : {
          key: 'sides',
          ok: false,
          title: 'Царги',
          words: !side
            ? runnerNl === null
              ? 'царги не выбраны; подобрать их можно, когда у ходовой есть NL (шаг выше)'
              : offers.length > 0
                ? `царги не выбраны — к ${short(runner)} подходят царги серии «${runner.hardware.series}» NL ${runnerNl} мм (ниже, высоту и цвет выбираете вы)`
                : `царги не выбраны, а царг серии «${runner.hardware.series}» NL ${runnerNl} мм в каталоге организации нет`
            : sideNl === null
              ? `у царг ${short(side)} нет NL — сначала сведения производителя`
              : `царги NL ${sideNl} мм к ходовой NL ${runnerNl ?? '—'} мм не подходят — нужна та же NL`,
          ...(offers.length > 0 && !sidesOk ? { offers } : {}),
        },
  );

  const box = production.drawerBox;
  steps.push(
    box
      ? {
          key: 'rules',
          ok: true,
          title: 'Короб ящика цеха',
          words: box.confirmed
            ? `правила цеха: боковины ${box.sideMm} мм, дно ${box.bottomMm} мм, подтверждены`
            : `правила цеха: боковины ${box.sideMm} мм, дно ${box.bottomMm} мм — не подтверждено цехом: короб и модель видны, выпуск в цех заперт`,
        }
      : {
          key: 'rules',
          ok: false,
          title: 'Короб ящика цеха',
          words:
            'правил короба цеха нет — короб и система ящика не строятся. «Настройки цеха» → «Короб ящика»: боковины (формулы Blum для дна и задней стенки — для ДСП 16 мм), дно — толщина, материал, крепление, паз; зазоры под и над коробом; ось направляющей; затем «Подтверждено цехом». Размеров за цех продукт не подставляет',
          href: '/admin/production#drawer-box',
        },
  );

  const missingModels = [runner, side].filter((item): item is HardwareItem => Boolean(item) && !item!.twin);
  const ready = missingModels.filter((item) => readyTwinFor(item.article));
  const none = missingModels.filter((item) => !readyTwinFor(item.article));
  steps.push(
    missingModels.length === 0
      ? { key: 'model', ok: true, title: '3D-модель', words: 'модели реестра стоят у ходовой и царг' }
      : {
          key: 'model',
          ok: false,
          title: '3D-модель',
          words: [
            ready.length > 0
              ? `для ${ready.map(short).join(', ')} есть готовая модель ALDIK — «Каталог» → «Импорт CAD-фурнитуры» → «Готовые модели ALDIK»`
              : null,
            none.length > 0
              ? `для ${none.map(short).join(', ')} готовой модели нет — ставится «Импортом CAD-фурнитуры»; до этого сцена рисует сечение профиля`
              : null,
          ]
            .filter(Boolean)
            .join('; '),
          href: '/admin/catalog/cad',
        },
  );
  return steps;
}
