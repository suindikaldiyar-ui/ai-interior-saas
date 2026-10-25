import {
  APPLIANCE_SLOTS,
  moduleAppliances,
  standsOnFloor,
} from './modules';
import { allModules } from './layout';
import { apronLengthMm, counterMitersOf, countertopCuts, countertopLengthMm } from './countertop';
import { cornerOfModule } from './corner';
import { moduleCarcassHeightMm } from './fill';
import { CORNER_HINGE_TITLE, frontDrawerSlides, liftKey, openingHardware } from './opening';
import { buildPanels, panelMaterials, partOfPanel } from './panels';
import { DEFAULT_PRODUCTION, type HardwareItem, type ProductionSettings } from '@/types/catalog';
import { resolveHardware } from './hardware';
import { FITTING_SLOT_TITLE, handleItemOf, installedItem } from './fittings';
import { GLASS_SHELF_LINE, glassLine, glassOf, shelvesAreGlass } from './glass';
import { moduleDrawerKits } from './drawerKit';
import { SLIDING_DOOR, displayLedMeters, sectionSpec, slidingDoorCount } from './sections';
import { MODULE_VARIANTS, isSinkBase, variantEstimateKeys } from './moduleVariants';
import { zoneProfile } from './zones';
import { bayDrawerStackOf, drawerHeights } from './drawerCount';
import { bayEnvelope, bayLayout } from './bays';
import { millingLink, type MillingItem } from './milling';
import { carcassLink, type CarcassItem } from './carcassMaterial';
import { leafFrontOf } from './frontMaterial';
import { RELIEF_STATUS, reliefKindDef } from './facadeRelief';
import { MATERIAL_FINISHES } from './materialFinishes';
import { PRICE_UNSET, priceState, type MaterialItem } from './materialCollection';
import type {
  Estimate,
  EstimateLine,
  EstimateUnit,
  FittingSlot,
  Module,
  Run,
  VariantKey, Panel,
} from '@/types/millwork';

/** Ключ работы «вырез столешницы под препятствие» — позиция каталога работ (слой 56). */
export const COUNTERTOP_CUTOUT_KEY = 'countertop_cutout';

/**
 * Смета из спецификации материалов.
 *
 * Ни одно число здесь не приходит от модели. Ставки берутся из каталога
 * организации, а не из кода: у каждой компании своя себестоимость.
 * В сохранённую смету кладётся снимок ставок на дату расчёта — иначе
 * подписанный договор «поплывёт» при следующей переоценке каталога.
 */

const MM2_IN_M2 = 1_000_000;
const MM_IN_M = 1000;

/** Ставки: ключ статьи → цена за единицу. Приходят из catalog_items. */
export type RateTable = Record<string, number>;

type Draft = {
  key: string;
  title: string;
  unit: EstimateUnit;
  quantity: number;
  /**
   * ЦЕНА ВЫБРАННОЙ ПОЗИЦИИ КАТАЛОГА.
   *
   * Заполняется только там, где у модуля выбрана СВОЯ фурнитура: цена
   * тогда берётся у позиции (`CatalogItem.price`), а не у типовой ставки
   * статьи. Копией она нигде не лежит — сюда приходит по ссылке
   * `Module.hardwareItemId` и дальше не хранится.
   *
   * Пусто — как раньше: ставка из `RateTable` по ключу статьи.
   */
  rate?: number;
  /**
   * ЦЕНА ПОЗИЦИИ НЕ ЗАДАНА — строка есть, денег в ней нет, и это сказано.
   *
   * Только у позиций коллекций каталога материалов (слой 51): их ставкой
   * цеха не подменить — эмаль по RAL не стоит как типовой фасад.
   */
  priceUnset?: string;
  /**
   * НЕТ СТАВКИ СТАТЬИ — «ЦЕНА НЕ ЗАДАНА» ЭТИМИ СЛОВАМИ (V3D-02): вид стекла
   * без своей ставки в каталоге не считается по цене прозрачного и не
   * становится «0 ₸» — строка остаётся с количеством, итог «неполный».
   */
  unsetWithoutRate?: string;
  /**
   * СТАВКА ДРУГОЙ СТАТЬИ (R02A.1): строка своя, а цена — по ключу этой
   * статьи. Так ящики отсеков идут ОТДЕЛЬНОЙ строкой оценки, не сливаясь
   * с подтверждёнными направляющими и ящиками, — а ставку берут ту же,
   * второго места под цену не появляется.
   */
  rateKey?: string;
  /**
   * ОЦЕНКА, А НЕ ПОДТВЕРЖДЁННАЯ ЦЕНА — и почему, словами (R02A.1). Деньги
   * в итоге есть, но итог помечен «с оценкой», и сумма оценки названа
   * отдельно (`estimatedLines`).
   */
  estimated?: string;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/* ─────────────────────────  Раскрой  ───────────────────────── */

/*
 * КОЛИЧЕСТВА МАТЕРИАЛОВ БЕРУТСЯ ИЗ ДЕТАЛИРОВКИ, А НЕ СЧИТАЮТСЯ ЗАНОВО.
 *
 * Здесь стояли четыре собственные формулы: площадь корпуса габаритным
 * прямоугольником, задняя стенка, фасады и кромка по числу створок. Рядом
 * `buildPanels` выдавала настоящие детали с настоящими торцами — и две
 * цифры расходились. На шкафе-купе и в прихожей кромки в раскрое было
 * на 13 % больше, чем в смете: цех клеил, компания за это не брала.
 *
 * Это был ПЯТЫЙ случай одного класса подряд — два расчёта одной величины,
 * которые молча разъезжаются. До него были полки, корпус, высота и состав
 * верхнего ряда. Поэтому лечение то же: второй расчёт удалён, а не
 * приведён к первому. Источник один — тот список деталей, который уходит
 * в цех.
 *
 * `edgeBandingMm` удалена целиком: своего смысла у неё не было. Она
 * описывала те же видимые торцы, что и `Panel.edges`, только грубее —
 * периметром модуля вместо периметра каждой детали.
 */

/* ─────────────────────────  Сборка строк  ───────────────────────── */

/**
 * Статьи, которых на кухне нет вовсе.
 *
 * Двери-купе, штанга, зеркало, кабель-канал — это не «прочее», а самые
 * заметные деньги в своей зоне: система купе стоит дороже корпуса, а
 * зеркало в прихожей дороже фасада. Считаем их от того же ряда, что даёт
 * чертёж, чтобы смета и рисунок не разошлись.
 */
function sectionDrafts(
  run: Run,
  production: ProductionSettings = DEFAULT_PRODUCTION,
  hardwareItems: Map<string, HardwareItem> = new Map(),
): Draft[] {
  const zone = zoneProfile(run.zone);
  if (!run.zone || run.zone === 'kitchen') return [];

  const drafts: Draft[] = [];
  const modules = allModules(run);
  const heightMm =
    zone.height === 'ceiling' ? run.ceilingHeightMm : zone.height;
  const heightM = heightMm / MM_IN_M;

  /*
   * Двери-купе считаются по м² полотна и растут вместе с шириной шкафа,
   * а система (направляющие, ролики, стопоры) — комплектом на каждую дверь.
   */
  if (run.doorSystem === 'sliding') {
    const doors = slidingDoorCount(run.lengthMm);
    const doorWidthM = (run.lengthMm / doors + SLIDING_DOOR.overlapMm) / MM_IN_M;

    drafts.push(
      {
        key: 'sliding_door',
        title: 'Двери-купе',
        unit: 'm2',
        quantity: round2(doors * doorWidthM * heightM),
      },
      { key: 'sliding_system', title: 'Система купе (комплект на дверь)', unit: 'set', quantity: doors },
    );
  }

  for (const unit of modules) {
    if (!unit.section) continue;
    const spec = sectionSpec(unit.section);
    const widthM = round3(unit.widthMm / MM_IN_M);

    switch (unit.section) {
      /*
       * ШТАНГИ — ИЗ `fill.rodsMm`, а не из вида секции.
       *
       * Раньше число выводилось из названия: `hanging_long` — одна,
       * `hanging_double` — две. Сегодня это совпадает с `fill`, но это
       * ДВА независимых источника, и расходятся такие пары молча. Плюс
       * штанга, которую замерщик добавил руками, не оплачивалась вовсе.
       */
      case 'hanging_long':
      case 'hanging_double': {
        const rods = unit.fill?.rodsMm.length || (unit.section === 'hanging_double' ? 2 : 1);
        drafts.push(
          {
            key: 'wardrobe_rod',
            title: 'Штанга для одежды',
            unit: 'mp',
            quantity: round2(widthM * rods),
          },
          { key: 'rod_holder', title: 'Держатели штанги', unit: 'pcs', quantity: 2 * rods },
        );
        break;
      }

      /*
       * Полки секций СЧИТАЮТСЯ ВЫШЕ, вместе со всеми остальными, по
       * `fill.shelves`. Здесь стоял второй расчёт — «шаг 350 мм, сколько
       * влезет», — и он не только расходился с раскроем, но и шёл ПОВЕРХ
       * полки, уже заложенной в корпус: одни и те же полки клиент
       * оплачивал дважды.
       */
      case 'shelves':
      case 'open':
        break;

      case 'drawers': {
        /*
         * КОРОБ РАССЧИТАН — ЕГО ДЕТАЛИ В РАСКРОЕ (HARDWARE-01): плита,
         * распил и кромка короба уже в строках материалов, и «Ящик в сборе»
         * по ставке оплатил бы его второй раз. Строка остаётся у ящиков без
         * короба — их число, а не все ящики секции.
         */
        const all = unit.fill?.drawerHeights.length || unit.drawerCount || spec.drawerCount;
        const boxed = moduleDrawerKits(unit, run, production, hardwareItems).filter(
          (kit) => kit.state === 'box' && !kit.place.bayId,
        ).length;
        if (all - boxed > 0) {
          drafts.push({
            key: 'drawer_box',
            title: 'Ящики в сборе',
            unit: 'set',
            quantity: all - boxed,
          });
        }
        break;
      }

      case 'hooks':
        // Крючки по одному на 150 мм ширины: куртка, сумка, зонт.
        drafts.push({
          key: 'coat_hook',
          title: 'Крючки',
          unit: 'pcs',
          quantity: Math.max(2, Math.round(unit.widthMm / 150)),
        });
        break;

      case 'shoes':
        drafts.push({
          key: 'shoe_rack',
          title: 'Обувница наклонная (ярус)',
          unit: 'pcs',
          quantity: 3,
        });
        break;

      case 'bench':
        drafts.push({ key: 'bench_seat', title: 'Скамья с мягким сиденьем', unit: 'pcs', quantity: 1 });
        break;

      case 'mirror':
        drafts.push({
          key: 'mirror_panel',
          title: 'Зеркало',
          unit: 'm2',
          quantity: round2(widthM * (spec.heightMm / MM_IN_M)),
        });
        break;

      case 'tv_niche':
        drafts.push(
          { key: 'cable_channel', title: 'Кабель-канал за нишей', unit: 'mp', quantity: widthM },
          { key: 'led_niche', title: 'Подсветка ниши LED', unit: 'mp', quantity: widthM },
        );
        break;

      case 'hanging_module':
        drafts.push({
          key: 'hanging_bracket',
          title: 'Подвесной крепёж (комплект на модуль)',
          unit: 'set',
          quantity: 1,
        });
        break;

      case 'vanity':
        drafts.push({ key: 'sink_cutout', title: 'Вырез под раковину', unit: 'pcs', quantity: 1 });
        break;

      case 'mirror_cabinet':
        drafts.push({
          key: 'mirror_panel',
          title: 'Зеркало',
          unit: 'm2',
          quantity: round2(widthM * (spec.heightMm / MM_IN_M)),
        });
        break;

      default:
        break;
    }
  }

  /*
   * Прихожая с открытой вешалкой: обычная штанга вдоль стены в 400 мм не
   * помещается — плечики упираются в фасад. Нужен пантограф или торцевая
   * штанга, и это отдельные деньги, а не «штанга как везде».
   */
  if (run.zone === 'hallway' && modules.some((m) => m.section === 'hooks')) {
    drafts.push({
      key: 'rod_pantograph',
      title: 'Штанга торцевая или пантограф',
      unit: 'set',
      quantity: 1,
    });
  }

  return drafts;
}

/**
 * МЕХАНИЗМ ВАРИАНТА МЕСТА — МЕСТО ФУРНИТУРЫ (HARDWARE-01): карго и
 * бутылочница — «карго», сушилка — «сушилка», карусель — «угловой механизм».
 */
const VARIANT_SLOT: Record<string, FittingSlot | undefined> = {
  cargo: 'cargo',
  bottle: 'cargo',
  tall_cargo: 'cargo',
  upper_dryer: 'dryer',
  corner_carousel: 'corner_unit',
};

/** Сколько физических изделий на месте: штуки, пары направляющих, механизмы. */
const SLOT_PER: Record<FittingSlot, 'piece' | 'pair' | 'mechanism'> = {
  hinge: 'piece',
  hinge_plate: 'piece',
  slide: 'pair',
  lift: 'mechanism',
  handle: 'piece',
  pantograph: 'mechanism',
  wardrobe_pullout: 'mechanism',
  cargo: 'mechanism',
  dryer: 'mechanism',
  corner_unit: 'mechanism',
  waste: 'mechanism',
  shelf_support: 'piece',
  leg: 'piece',
};

/**
 * СКОЛЬКО ЕДИНИЦ ПРОДАЖИ НА МЕСТО (HARDWARE-01).
 *
 * Позиция производителя (`meta.hardware.manufacturer`) считается по
 * единице из паспорта (`saleUnit`): направляющие — парой на ящик или
 * поштучно (две на ящик); петли, планки, ручки, опоры — штуками;
 * механизмы — комплектом или штукой на место. Единица не названа — цену
 * применить нельзя, и это сказано: «компл.» у Hettich KA не расшифрован
 * (пара или одна направляющая), и сосчитать его наугад значит выписать
 * вдвое больше или вдвое меньше.
 *
 * Позиция компании без записи производителя — как всегда считала смета:
 * штуки, комплект на ящик, механизм на место. Её цену заводила компания
 * под эту единицу.
 */
function saleQuantity(
  item: HardwareItem,
  per: 'piece' | 'pair' | 'mechanism',
  count: number,
): { quantity: number; unit: EstimateUnit; note: string; unsure?: string } {
  const sale = item.hardware.saleUnit;
  const ownRow = !item.hardware.manufacturer;
  if (per === 'pair') {
    if (sale === 'piece') return { quantity: count * 2, unit: 'pcs', note: ' (по две на ящик)' };
    if (sale === 'pair' || ownRow) return { quantity: count, unit: 'set', note: ' (пара на ящик)' };
    return {
      quantity: count,
      unit: 'set',
      note: ' (пар на ящик)',
      unsure:
        `единица продажи «${item.hardware.packaging ?? 'не указана'}» в паспорте не расшифрована — пара или одна направляющая; ` +
        'цену не применяем, пока компания не укажет единицу',
    };
  }
  if (per === 'piece') {
    if (sale === 'piece' || ownRow) return { quantity: count, unit: 'pcs', note: '' };
    return {
      quantity: count,
      unit: 'pcs',
      note: '',
      unsure: `единица продажи «${item.hardware.packaging ?? 'не указана'}» — штука или упаковка, в паспорте не сказано; цену не применяем`,
    };
  }
  if (sale === 'set' || sale === 'piece' || ownRow) return { quantity: count, unit: 'set', note: '' };
  return {
    quantity: count,
    unit: 'set',
    note: '',
    unsure: `сколько единиц «${item.hardware.packaging ?? 'не указана'}» на одно место — в паспорте не сказано; цену не применяем`,
  };
}

/**
 * СЧЁТ ФУРНИТУРЫ ПО МЕСТАМ (HARDWARE-01).
 *
 * `take` — место модуля занято позицией каталога: количество уходит в её
 * строку, и вызывающий вычитает его из общей. Позиции нет в каталоге или
 * она отключена — место считается как раньше, по общей строке (ответ
 * `false`). Цены нет — строка есть, денег в ней нет: «цена не задана»,
 * итог «неполный» (ловушка 452) — бесплатной фурнитуры не бывает.
 *
 * Единица строки — из паспорта (`saleUnit`): направляющие — комплектом
 * на ящик, а позиция «поштучно» — две на ящик; остальное — штуками и
 * механизмами, как в общих строках.
 */
function fittingTally(catalog: Map<string, HardwareItem>) {
  const lines = new Map<string, { item: HardwareItem; slot: FittingSlot; quantity: number }>();
  const missing = new Map<FittingSlot, { title: string; quantity: number }>();
  const pantographs = new Set<string>();
  /* Что стоит на месте — `installedItem`, та же функция, по которой сцена рисует механизм. */
  const itemOf = (unit: Module, slot: FittingSlot, bayId?: string): HardwareItem | null => installedItem(unit, slot, catalog, bayId);
  /* Позиция уже найдена (ручка детали — `handleItemOf`): строка по ней. */
  const takeItem = (item: HardwareItem | null, slot: FittingSlot, quantity: number): boolean => {
    if (!item || quantity <= 0) return false;
    const key = `${slot}|${item.id}`;
    const row = lines.get(key) ?? { item, slot, quantity: 0 };
    row.quantity += quantity;
    lines.set(key, row);
    return true;
  };
  const take = (unit: Module, slot: FittingSlot, quantity: number, bayId?: string): boolean => {
    if (!takeItem(itemOf(unit, slot, bayId), slot, quantity)) return false;
    if (slot === 'pantograph' && bayId) pantographs.add(`${unit.id}:${bayId}`);
    return true;
  };
  return {
    take,
    takeItem,
    /** Место, без которого выбранное не ставится: не выбрано — строка «не выбрано» без цены. */
    needs(unit: Module, slot: FittingSlot, quantity: number, title: string): void {
      if (take(unit, slot, quantity)) return;
      const row = missing.get(slot) ?? { title, quantity: 0 };
      row.quantity += quantity;
      missing.set(slot, row);
    },
    pantographBays(): Set<string> {
      return pantographs;
    },
    drafts(): Draft[] {
      const out: Draft[] = [];
      for (const { item, slot, quantity } of Array.from(lines.values())) {
        const sale = saleQuantity(item, SLOT_PER[slot], quantity);
        out.push({
          key: `fitting_${slot}_${item.id}`,
          title: `${item.name} — ${FITTING_SLOT_TITLE[slot].toLowerCase()}${sale.note}`,
          unit: sale.unit,
          quantity: sale.quantity,
          ...(sale.unsure
            ? { priceUnset: sale.unsure }
            : Number.isFinite(item.price) && item.price > 0
              ? { rate: item.price }
              : { priceUnset: 'цена не задана: позицию производителя компания ещё не оценила' }),
        });
      }
      for (const [slot, { title, quantity }] of Array.from(missing.entries())) {
        out.push({
          key: `fitting_${slot}_missing`,
          title,
          unit: 'pcs',
          quantity,
          priceUnset: 'позиция не выбрана: без неё выбранная фурнитура не ставится',
        });
      }
      return out;
    },
  };
}

export function buildEstimateDrafts(
  run: Run,
  production: ProductionSettings = DEFAULT_PRODUCTION,
  /**
   * Фурнитура организации. Пусто — расчёт ровно такой, каким был до
   * каталога: ни одна существующая смета от появления параметра не
   * меняется.
   */
  hardwareItems: Map<string, HardwareItem> = new Map(),
  /**
   * Фрезеровки организации. Пусто — смета ровно такая, какой была до
   * каталога фрезеровок: ни одна сохранённая от появления параметра не
   * меняется.
   */
  millingItems: Map<string, MillingItem> = new Map(),
  carcassItems: Map<string, CarcassItem> = new Map(),
  /**
   * Позиции коллекций каталога материалов. Пусто — смета ровно такая, какой
   * была до каталога: ни одна сохранённая от появления параметра не едет.
   */
  materialItems: Map<string, MaterialItem> = new Map(),
  /**
   * Ставки — ради цены коллекции (слой 52): она лежит ставкой
   * `material_<коллекция>_<поверхность>`, и позиция без своей цены
   * берёт её оттуда той же `materialPrice`, что и панель.
   */
  rates: RateTable = {},
): Draft[] {
  /*
   * Высоту и потолок больше не разбираем по кусочкам: всё, что считает
   * габарит, берёт `moduleCarcassHeightMm(unit, run)` — ту же функцию,
   * что чертёж и деталировка.
   */
  const modules = allModules(run);

  /*
   * ОПОРЫ — У ВСЕГО, ЧТО СТОИТ НА ПОЛУ.
   *
   * Здесь стоял список видов: base, corner_base, filler. Пенал в него не
   * попадал — а он стоит на полу ровно так же, и опоры под ним те же
   * четыре. Вопрос-то не «какого вида модуль», а «стоит ли он на полу»,
   * и ответ на него теперь один на продукт.
   */
  const floorModules = run.modules.filter((unit) => standsOnFloor(unit));

  /*
   * ОДИН ВЫЗОВ ВМЕСТО ЧЕТЫРЁХ ФОРМУЛ. `production` тот же, что у листа
   * раскроя: у компании своя толщина плиты, и посчитай смета по умолчанию,
   * пока цех пилит по 18 мм — расхождение вернулось бы той же дверью.
   */
  /*
   * ПАНЕЛИ НАРЕЗАЮТСЯ ОДИН РАЗ НА СМЕТУ.
   *
   * Из них считается и площадь материалов, и площадь фрезеровки: второй
   * вызов `buildPanels` с другими аргументами дал бы две раскладки одной
   * мебели.
   */
  const panels = buildPanels({ run, production, milling: millingItems, hardware: hardwareItems });
  const materials = panelMaterials(panels);

  /*
   * ФУРНИТУРА СЧИТАЕТСЯ ИЗ ВЫБРАННОГО НАПРАВЛЕНИЯ, А НЕ ИЗ РЯДА.
   *
   * Здесь стояло «верхний ряд — значит подъёмник»: каждый верхний фасад
   * получал газлифт за 7 800 ₸ поверх петель за 900 ₸, хотя большинство
   * верхних шкафов делают распашными. Число бралось из догадки о ряде, а
   * не из данных о мебели — и мебельщик видел это первым, потому что это
   * его расход.
   *
   * Теперь всё считает `openingHardware` по `fill.hinge` — тому же полю,
   * по которому чертёж рисует диагональ, а сцена вращает фасад.
   */
  const hardware = openingHardware(
    modules.map((unit, index) => ({
      unit,
      heightMm: moduleCarcassHeightMm(unit, run),
      index,
      total: modules.length,
    })),
    run,
    /*
     * Угловые петли — у Г-модуля и у створки слепого угла у фальш-панели;
     * глухому модулю угла петель и ручки не покупают (слой 55). Тот же
     * ответ берёт сцена — петель на картинке столько же.
     */
    cornerOfModule(run),
  );

  let hinges = hardware.hinges;
  let slides = 0;
  /*
   * ФУРНИТУРА ПРОИЗВОДИТЕЛЯ НА МЕСТАХ МОДУЛЕЙ (HARDWARE-01) — своими
   * строками. Количество то же, что у общих строк (те же счётчики), и
   * из общей строки оно ВЫЧИТАЕТСЯ: петля, посчитанная позицией, в
   * «Петлях (стандарт)» второй раз не оплачивается.
   */
  const fit = fittingTally(hardwareItems);
  let lifts = hardware.lifts;
  let handleBar = hardware.handleBar;

  /**
   * ВЫБРАННАЯ ФУРНИТУРА СЧИТАЕТСЯ СВОЕЙ СТРОКОЙ.
   *
   * Модуль, у которого выбрана позиция каталога, уходит из общей строки
   * ряда в свою: там цена этой позиции. Количество при этом ТО ЖЕ — оно
   * приходит из `openingHardware.byModule` и из числа фронтов, то есть
   * из состава ряда. Каталог задаёт цену, а не второе количество.
   *
   * Ссылка не разрешилась (позицию удалили, отключили, открыли в другой
   * организации, цена не задана) — модуль остаётся в общей строке и
   * считается как раньше. Молчаливого нуля здесь нет: расхождение
   * называет `hardwareWarnings` словами.
   */
  const picked = new Map<string, { item: HardwareItem; hinges: number; slides: number }>();

  const pickOf = (unit: Module) => {
    const link = resolveHardware(unit, hardwareItems);
    if (link.state !== 'resolved') return null;

    const seen = picked.get(link.item.id);
    if (seen) return seen;

    const fresh = { item: link.item, hinges: 0, slides: 0 };
    picked.set(link.item.id, fresh);
    return fresh;
  };

  for (const unit of modules) {
    const pick = pickOf(unit);
    const ownHw = hardware.byModule[unit.id];
    /*
     * Петли этого модуля — из того же разреза, что и итог ряда: числа
     * накоплены одним циклом, и вычитание не может увести их в минус.
     * Петля на месте модуля (HARDWARE-01) сильнее прежней ссылки модуля.
     */
    const ownHinges = ownHw?.hinges ?? 0;
    if (ownHinges > 0 && fit.take(unit, 'hinge', ownHinges)) {
      hinges -= ownHinges;
      /* Петля производителя ставится на ответную планку: не выбрана — названо строкой. */
      fit.needs(unit, 'hinge_plate', ownHinges, 'Ответные планки к выбранным петлям — не выбраны');
    } else if (pick) {
      pick.hinges += ownHinges;
      hinges -= ownHinges;
    }
    if ((ownHw?.lifts ?? 0) > 0 && fit.take(unit, 'lift', ownHw!.lifts)) lifts -= ownHw!.lifts;
    /*
     * РУЧКИ — ПО ДЕТАЛЯМ (HANDLE-REAL): позиция своей створки или ящика
     * сильнее ручки модуля (`handleItemOf` — та же функция, по которой сцена
     * рисует ручку). Детали — те же, что посчитаны в общей строке скоб;
     * деталь без позиции остаётся в ней.
     */
    for (const leaf of hardware.handleLeaves[unit.id] ?? []) {
      if (fit.takeItem(handleItemOf(unit, leaf, hardwareItems), 'handle', 1)) handleBar -= 1;
    }

    {
      /*
       * ЧИСЛО ЯЩИКОВ — ОДНА ВЕЛИЧИНА, И ЖИВЁТ ОНА В `fill`.
       *
       * Здесь стоял запасной путь `|| unit.drawerCount`, и он был не
       * подстраховкой, а ВТОРЫМ определением: пока `fill` оставался
       * пустым после `set_fronts`, раскрой давал ноль фронтов, а смета
       * по этому запасному числу выписывала три направляющие.
       *
       * Здесь же стояло условие `unit.frontType === 'drawers'` — и это
       * была ТРЕТЬЯ формула того же: у модуля под варочной панелью тип
       * фасада `appliance`, и смета не выписывала направляющих вовсе,
       * пока раскрой резал два фронта. Цех получал панели, которые не на
       * чем выдвигать, — зеркало той ошибки, от которой уводил комментарий
       * выше (ловушка 358).
       *
       * Условия ровно те же, что у отрисовки и у раскроя: фронты в
       * наполнении и не колонна.
       */
      /* Ящики отсеков (R02A.1) — своей строкой оценки ниже (`bayDrawerDrafts`). */
      const drawers = frontDrawerSlides(unit);
      if (drawers > 0 && fit.take(unit, 'slide', drawers)) {
        /* Направляющая на месте модуля — своей строкой (HARDWARE-01). */
      } else if (pick) pick.slides += drawers;
      else slides += drawers;
    }

    /*
     * Петли для встройки — фасад висит на дверце прибора, а не на
     * корпусе, и комплект у них свой — считает `openingHardware` вместе
     * с остальной фурнитурой фасада. Здесь стоял второй их подсчёт, и
     * из-за него разрез по модулям показывал встроенный холодильник без
     * единой петли.
     */
  }

  // Столешница: длина ряда плюс запил на угол, если ряд угловой.
  /*
   * СТЫК В УГЛУ ЕСТЬ ПРИ ЛЮБОМ РЕШЕНИИ УГЛА.
   *
   * Здесь спрашивался угловой МОДУЛЬ, и при фальш-панели запила не было
   * вовсе — при том, что плит в углу всё равно две и встречаются они по
   * стыку. Спрашиваем факт угла (`run.corner.ahead`), а не одно из двух
   * его решений; считается он на ряду ПЕРЕД углом, поэтому на кухню
   * приходится один запил, а не два.
   */
  /*
   * СТЫК — ОДИН НА УГОЛ И У ВЛАДЕЛЬЦА (слой 55).
   *
   * Владелец угла даёт плиту на всю глубину угла, сосед к ней стыкуется:
   * стык — операция над плитой владельца, и считается он на его ряду. На
   * экране стена А собиралась без угла, и у Г-образной кухни запила в
   * смете не было вовсе, а у П-образной был один на два угла.
   *
   * Ряд без поля угла (прежний вход `cornerAt`, старые места) — по виду
   * углового модуля, как и было.
   */
  /*
   * Стык — у ряда, чья ПЛИТА идёт через угол (P0, `counterMitersOf`): плита
   * — свой контур, и через угол её может вести не та стена, что ведёт низ.
   * У средней стены П, ведущей плиту в оба угла, стыков два.
   */
  const miters = run.corner
    ? counterMitersOf(run)
    : run.modules.some((m) => m.kind === 'corner_base')
      ? 1
      : 0;

  /*
   * ДЛИНА СОБРАННОГО РЯДА, А НЕ ДЛИНА СТЕНЫ.
   *
   * Столешницу, плинтус и фартук кладут поверх нижнего ряда — там, где
   * стоят тумбы. В раскладке по шаблону ряд занимает стену целиком, и
   * разницы не было; в свободной сборке она видна сразу: на пустой стене
   * смета выставляла 3.8 погонных метра столешницы и фартука за мебель,
   * которой ещё нет.
   *
   * Верхние модули столешницу не несут — считаем только нижний ряд.
   */
  /*
   * СТОЛЕШНИЦА ОБХОДИТ УГОЛ — И ЭТО ТЕ ЖЕ МИЛЛИМЕТРЫ, ЧТО В СЦЕНЕ.
   *
   * Плита ряда ПОСЛЕ угла заходит назад на всё, что угол занял; плита
   * ряда ПЕРЕД углом кончается там, где начинается соседняя. Раньше обе
   * кончались у своего ряда, и между ними оставалась щель 59 мм — её
   * никто не резал и никто не оплачивал, а в углу было видно дыру.
   *
   * Считает заход `cornerBandMm` — та же функция, что двигает плиту в
   * сцене. Второй формулы «сколько столешницы в углу» не появляется: у
   * прямого ряда `run.corner` пуст, и метраж не меняется ни на миллиметр.
   */
  /*
   * ПЛИТЫ СЧИТАЕТ `countertopSlabs` — та же функция кладёт их в сцену.
   * Сплошная над пустотой между модулями, рвётся колонной, заход в угол
   * — как и раньше, через `cornerBandMm`.
   */
  const counterLengthMm = countertopLengthMm(run);

  /*
   * ПУСТОЙ РЯД НЕ ПОЛУЧАЕТ УГЛА.
   *
   * Заход в угол — это плита НАД мебелью. Нет мебели — нет и плиты:
   * иначе пустая стена углового объекта выставляла бы 660 мм столешницы
   * за то, чего ещё нет (ловушка 230, только теперь через угол).
   */
  const counterMp = round3(counterLengthMm / MM_IN_M);

  /*
   * ДЛИНА РЯДА И ДЛИНА СТОЛЕШНИЦЫ — РАЗНЫЕ ВЕЛИЧИНЫ.
   *
   * Ручка-профиль идёт по фасадам, а карниз — по верху ряда: колонна
   * холодильника фасад имеет, а столешницы на себе не несёт. Пока обе
   * длины брались из одной переменной, поправка столешницы утащила бы за
   * собой и ручку — а её никто не просил менять.
   */
  const frontRowMp = round3(
    run.modules
      .filter((unit) => standsOnFloor(unit))
      .reduce((sum, unit) => sum + unit.widthMm, 0) / MM_IN_M,
  );

  /*
   * Столешницы и фартука в спальне и прихожей нет вовсе. Считать их «на всякий
   * случай» нельзя: клиент увидел бы в смете позицию, которой не существует.
   */
  const zone = zoneProfile(run.zone);

  /*
   * В санузле корпус влагостойкий: обычный ЛДСП разбухает по кромке за пару
   * лет. Это другой материал и другая ставка, поэтому и ключ другой —
   * подставлять цену обычного было бы враньём в смете.
   */
  const carcassKey = zone.moistureProof ? 'ldsp_moisture' : 'ldsp_carcass';
  const carcassTitle = zone.moistureProof ? 'Корпус влагостойкий ЛДСП' : 'Корпус ЛДСП';

  const drafts: Draft[] = [
    /*
     * КОРПУС ПО СТАВКЕ ЦЕХА — ТОЛЬКО ТО, ЧТО НЕ ПОКРАШЕНО ДЕКОРОМ.
     *
     * Площадь модулей с выбранным материалом уходит в свою строку по
     * цене позиции каталога; здесь её вычитаем, иначе она оплачена
     * дважды. Это тот же приём, что у выбранной фурнитуры: каталог
     * задаёт ЦЕНУ, а количество приходит из раскроя.
     */
    {
      key: carcassKey,
      title: carcassTitle,
      unit: 'm2',
      quantity: round2(Math.max(0, materials.carcassM2 - pickedCarcassM2(run, panels, carcassItems, ['carcass', 'partitions']))),
    },
    /*
     * ПОЛКИ ОТДЕЛЬНОЙ СТРОКОЙ — одна на весь ряд, по `fill.shelves`.
     *
     * Строка есть всегда, даже при нуле: пропадёт при нуле — и «полок нет»
     * станет неотличимо от «полки забыли посчитать». Ровно так эта ошибка
     * и прожила: в корпус была зашита одна полка на модуль, и её никто
     * не видел.
     */
    /*
     * Полки со СВОИМ декором (`run.carcass.shelves`) уходят своей строкой —
     * по цене декора; их площадь отсюда вычитается. Полки без своего декора
     * остаются здесь, как всегда, по ставке цеха «Полки».
     */
    {
      key: 'shelf_panel',
      title: 'Полки',
      unit: 'm2',
      quantity: round2(Math.max(0, materials.shelfM2 - pickedCarcassM2(run, panels, carcassItems, ['shelves']))),
    },
    { key: 'hdf_back', title: 'Задние стенки ХДФ', unit: 'm2', quantity: materials.backM2 },
    /*
     * ФАСАДЫ ПО СТАВКЕ ЦЕХА — ТОЛЬКО ТЕ, ЧТО НЕ ИЗ КОЛЛЕКЦИИ.
     *
     * Фасады позиции каталога материалов идут своей строкой по её цене,
     * и их площадь отсюда вычитается — тот же приём, что у корпуса своего
     * декора. Площадь та же, что в раскрое: вторая формула «сколько
     * фасадов» разошлась бы с цехом.
     */
    {
      key: 'front_panel',
      title: 'Фасады',
      unit: 'm2',
      quantity: round2(Math.max(0, materials.frontM2 - pickedFrontM2(run, panels, materialItems))),
    },
    ...frontMaterialDrafts(run, panels, materialItems, rates),
    /*
     * ФРЕЗЕРОВКА — СВОЯ СТРОКА, И ПЛОЩАДЬ У НЕЁ ИЗ РАСКРОЯ.
     *
     * Второго расчёта площади здесь нет: панели уже нарезаны, и их
     * площадь складывается тем же способом, что и в `panelMaterials`.
     * Считать её заново значило бы развести статью фрезеровки со строкой
     * «Фасады» на первой же правке припуска.
     *
     * Строка на КАЖДУЮ фрезеровку отдельно: у низа Модерн, у верха
     * Александрия — это две операции и две цены, и сложить их в одну
     * строку значит показать клиенту среднюю цену, которой нет.
     *
     * Позиция без цены строки не даёт вовсе — ноль здесь не «бесплатно»,
     * а «цену не задали», и говорит об этом `millingWarnings`.
     */
    ...millingDrafts(run, panels, millingItems),
    /*
     * РИСУНОК МДФ БЕЗ ЦЕНЫ (P3D-MDF) — строкой «цена не задана», а не
     * молчанием: клиент видит в 3D рифлёный фасад, и смета без этой строки
     * показала бы цену ровного.
     */
    ...reliefDrafts(run, panels, millingItems),
    ...carcassDrafts(run, panels, carcassItems, materialItems, rates),
    { key: 'pvc_edge', title: 'Кромка ПВХ', unit: 'mp', quantity: materials.edgeM },
  ];

  if (zone.hasCountertop && zone.moistureProof) {
    // Санузел: столешница своя, влагостойкая, и запила на угол там не бывает.
    drafts.push({
      key: 'countertop_moisture',
      title: 'Столешница влагостойкая',
      unit: 'mp',
      quantity: counterMp,
    });
  } else if (zone.hasCountertop) {
    /*
     * СТОЛЕШНИЦА ИЗ КАТАЛОГА МАТЕРИАЛОВ — ПО ЦЕНЕ ПОЗИЦИИ.
     *
     * Метраж тот же (`countertopSlabs`), меняется ставка. Позиции нет в
     * каталоге — остаётся тип столешницы по ставке цеха, как у корпуса
     * пропавшего декора; позиция есть без цены — «цена не задана».
     */
    const counterItem = run.countertopMaterial
      ? materialItems.get(run.countertopMaterial.itemId)
      : undefined;
    if (counterItem) {
      const price = priceState(counterItem, run.countertopMaterial?.surface, 'running_m', rates);
      drafts.push({
        key: `countertop_item_${counterItem.id}`,
        title: `Столешница ${counterItem.code}${counterItem.name ? ` «${counterItem.name}»` : ''}`,
        unit: 'mp',
        quantity: counterMp,
        ...(price.state === 'priced' ? { rate: price.rate } : { priceUnset: price.reason }),
      });
    } else {
      drafts.push({
        key: `countertop_${run.options.countertop}`,
        title: `Столешница (${countertopTitle(run.options.countertop)})`,
        unit: 'mp',
        quantity: counterMp,
      });
    }

    /*
     * Запил — это операция НАД ПЛИТОЙ. Нет плиты — нет и запила: пустая
     * стена углового объекта иначе стоила бы 25 000 ₸ за стык двух
     * столешниц, которых ещё нет.
     */
    if (miters > 0 && counterMp > 0) {
      drafts.push({ key: 'countertop_miter', title: 'Запил столешницы на угол', unit: 'pcs', quantity: miters });
    }

    /*
     * ВЫРЕЗ СТОЛЕШНИЦЫ ПОД ПРЕПЯТСТВИЕ (слой 56) — работа цеха, штуками.
     *
     * Плиту вырезают сзади под короб или колонну, когда перед ними
     * остаётся полоса не уже настройки цеха — решает `counterObstacles`.
     * Штуки — вырезы ТЕХ ЖЕ плит, что рисует сцена (`countertopCuts`):
     * второго счёта «где вырез» нет. Цена — позиция каталога работ
     * организации; не задана — строка остаётся с количеством и словами
     * «цена не задана», итог «неполный»: не ноль и не пропавшая строка.
     */
    const cutouts = countertopCuts(run).length;
    if (cutouts > 0) {
      const cutoutRate = rates[COUNTERTOP_CUTOUT_KEY] ?? 0;
      drafts.push({
        key: COUNTERTOP_CUTOUT_KEY,
        title: 'Вырез столешницы под препятствие',
        unit: 'pcs',
        quantity: cutouts,
        ...(cutoutRate > 0 ? { rate: cutoutRate } : { priceUnset: PRICE_UNSET }),
      });
    }

    drafts.push({
      key: 'countertop_plinth',
      title: 'Плинтус столешницы',
      unit: 'mp',
      quantity: counterMp,
    });
  }

  if (zone.hasApron) {
    /*
     * ФАРТУК — ТЕМ ЖЕ ОТВЕТОМ, ЧТО РИСУЕТ СЦЕНА (`apronSpans`, слой 55).
     *
     * Здесь стояла длина столешницы при верхнем ряде, а сцена рисовала
     * фартук на всю длину ряда. У прямой кухни ответ функции тот же —
     * столешница при верхнем ряде, — а в углу у стыкующейся стены фартук
     * идёт до стены владельца: над угловой плитой её стена тоже открыта.
     */
    drafts.push({
      key: 'wall_panel',
      title: 'Стеновая панель (фартук)',
      unit: 'mp',
      quantity: round3(apronLengthMm(run) / MM_IN_M),
    });
  }

  drafts.push(
    { key: `hinge_${run.options.hardwareClass}`, title: `Петли (${hardwareTitle(run.options.hardwareClass)})`, unit: 'pcs', quantity: hinges },
    /*
     * Угловая петля 175° — отдельная строка, а не наценка: обычная петля
     * в углу упирается в перпендикулярный фасад, и это переделка на
     * объекте. Строка появляется, только если угловые модули есть.
     */
    ...(hardware.cornerHinges > 0
      ? [
          {
            key: 'hinge_corner_175',
            title: CORNER_HINGE_TITLE,
            unit: 'pcs' as const,
            quantity: hardware.cornerHinges,
          },
        ]
      : []),
    { key: `slide_${run.options.hardwareClass}`, title: `Направляющие (${hardwareTitle(run.options.hardwareClass)})`, unit: 'set', quantity: slides },
    {
      key: liftKey(run.options.hardwareClass),
      title: 'Подъёмник фасада',
      unit: 'pcs',
      quantity: lifts,
    },
    ...(hardware.flaps > 0
      ? [
          {
            key: 'flap_mechanism',
            title: 'Механизм откидного фасада',
            unit: 'pcs' as const,
            quantity: hardware.flaps,
          },
        ]
      : []),
    /*
     * РУЧКИ — ТРИ РАЗНЫЕ СТРОКИ, А НЕ ОДНА НА ВЕСЬ РЯД.
     *
     * Скоба, врезной профиль и нажимной механизм — разная фурнитура и
     * разные деньги; выбирают их помодульно. Пока строка была одна и
     * зависела от опции ряда, выбор на модуле в смету не попадал вовсе.
     *
     * Строка появляется, только если такая ручка в ряду есть: «Ручки: 0»
     * читается как забытая позиция (ловушка 195).
     */
    ...(handleBar > 0
      ? [
          {
            key: 'handle_standard',
            title: 'Ручки накладные',
            unit: 'pcs' as const,
            quantity: handleBar,
          },
        ]
      : []),
    ...(hardware.handleProfileMm > 0
      ? [
          {
            key: 'handle_integrated',
            title: 'Ручка-профиль',
            unit: 'mp' as const,
            quantity: round3(hardware.handleProfileMm / MM_IN_M),
          },
        ]
      : []),
    ...(hardware.handlePush > 0
      ? [
          {
            key: 'push_to_open',
            title: 'Механизм push-to-open',
            unit: 'pcs' as const,
            quantity: hardware.handlePush,
          },
        ]
      : []),
    /*
     * ВЫБРАННАЯ ФУРНИТУРА — ОТДЕЛЬНЫМИ СТРОКАМИ, ПО ЦЕНЕ КАТАЛОГА.
     *
     * Строка появляется только там, где позиция выбрана и разрешилась:
     * у рядов без выбора этих строк нет вовсе, и сумма у них прежняя.
     */
    ...Array.from(picked.values()).flatMap((pick) => {
      const rows: Draft[] = [];
      if (pick.hinges > 0) {
        rows.push({
          key: `hardware_${pick.item.id}`,
          title: `${pick.item.name} (петли)`,
          unit: 'pcs',
          quantity: pick.hinges,
          rate: pick.item.price,
        });
      }
      if (pick.slides > 0) {
        rows.push({
          key: `hardware_${pick.item.id}_slides`,
          title: `${pick.item.name} (направляющие)`,
          unit: 'set',
          quantity: pick.slides,
          rate: pick.item.price,
        });
      }
      return rows;
    }),
    // Четыре регулируемые опоры на каждый нижний модуль — кроме тех, где опора выбрана позицией.
    {
      key: 'leg_support',
      title: 'Опоры регулируемые',
      unit: 'pcs',
      quantity: floorModules.filter((unit) => !fit.take(unit, 'leg', 4)).length * 4,
    },
    { key: 'fasteners', title: 'Крепёж и эксцентрики', unit: 'percent', quantity: materials.carcassM2 },
    { key: 'cutting', title: 'Распил и присадка', unit: 'm2', quantity: round2(materials.carcassM2 + materials.shelfM2 + materials.frontM2) },
  );

  if (run.options.hasCornice) {
    drafts.push({ key: 'cornice', title: 'Антресоль до потолка', unit: 'mp', quantity: frontRowMp });
  }

  /*
   * Витрина живёт и в кухне, и в зале, поэтому считается отдельно от
   * секционных зон: `sectionDrafts` на кухне не работает вовсе. Стекло в
   * раме — это не фасад ЛДСП, и подсветка идёт по контуру погонными
   * метрами, а не «комплектом».
   */
  for (const unit of modules) {
    if (unit.section !== 'glass_display') continue;
    const h = moduleCarcassHeightMm(unit, run);
    /* Вид стекла (V3D-02): прозрачное — прежняя статья, другой вид — своя ставка. */
    const glass = glassLine(glassOf(unit));

    drafts.push(
      {
        key: glass.key,
        title: `Стеклянная дверь в раме${glass.suffix}`,
        unit: 'm2',
        quantity: round2((unit.widthMm * h) / MM2_IN_M2),
        ...(glass.unsetWithoutRate ? { unsetWithoutRate: glass.unsetWithoutRate } : {}),
      },
      {
        key: 'led_display',
        title: 'Подсветка витрины LED',
        unit: 'mp',
        quantity: displayLedMeters(unit.widthMm, h),
      },
    );
  }

  /*
   * Статьи вариантов: механизм карго, сушилка, подъёмник, карусель.
   * Корпус у них обычный — отдельной строкой идёт именно механизм,
   * иначе он растворится в стоимости ЛДСП и пропадёт из сметы.
   */
  for (const unit of modules) {
    /*
     * Механизм выбран позицией производителя (HARDWARE-01) — строка
     * варианта по типовой ставке уходит: механизм оплачен своей строкой.
     */
    const variantSlot = VARIANT_SLOT[unit.variant ?? ''];
    if (variantSlot && fit.take(unit, variantSlot, 1)) continue;
    for (const key of variantEstimateKeys(unit)) {
      const spec = MODULE_VARIANTS[unit.variant!];
      /* Стекло варианта — по виду стекла модуля (V3D-02), как у витрины в раме. */
      const glass = key === 'glass_front' ? glassLine(glassOf(unit)) : null;
      drafts.push({
        key: glass ? glass.key : key,
        title: `${spec.title} (${unit.widthMm} мм)${glass ? glass.suffix : ''}`,
        unit: key === 'glass_front' ? 'm2' : 'pcs',
        quantity:
          key === 'glass_front'
            ? round2(
                (unit.widthMm * moduleCarcassHeightMm(unit, run)) / MM2_IN_M2,
              )
            : 1,
        ...(glass?.unsetWithoutRate ? { unsetWithoutRate: glass.unsetWithoutRate } : {}),
      });
    }
  }

  /*
   * СТЕКЛЯННЫЕ ПОЛКИ (V3D-02): из раскроя ЛДСП они ушли (`shelvesAreGlass`),
   * здесь — штуками по ставке каталога. Нет ставки — «цена не задана».
   */
  for (const unit of modules) {
    if (!shelvesAreGlass(unit)) continue;
    const count = unit.fill?.shelves.length ?? 0;
    if (count === 0) continue;
    drafts.push({
      key: GLASS_SHELF_LINE.key,
      title: `Полка стеклянная (${unit.label}, ${unit.widthMm} мм)`,
      unit: 'pcs',
      quantity: count,
      unsetWithoutRate: GLASS_SHELF_LINE.unsetWithoutRate,
    });
  }

  drafts.push(...sectionDrafts(run, production, hardwareItems));

  drafts.push(...bayDrawerDrafts(run, hardwareItems, production));
  /* Пантограф отсека (HARDWARE-01) — вместо штанги этого отсека. */
  for (const unit of modules) {
    for (const f of unit.fittings ?? []) {
      if (f.bayId && (f.slot === 'pantograph' || f.slot === 'wardrobe_pullout')) fit.take(unit, f.slot, 1, f.bayId);
    }
  }
  drafts.push(...bayRodDrafts(run, production, fit.pantographBays()));
  drafts.push(...fit.drafts());

  /*
   * Техника и мойка — отдельными позициями, их клиент часто покупает сам.
   * В колонне приборов ДВА, и второй терять нельзя: клиент заказал
   * микроволновку, а в смете её нет — это разговор о доверии, а не о
   * девяноста тысячах.
   */
  for (const unit of modules) {
    for (const appliance of moduleAppliances(unit)) {
      drafts.push({
        key: `appliance_${appliance}`,
        title: APPLIANCE_SLOTS[appliance].title,
        unit: 'pcs',
        quantity: 1,
      });
    }
  }

  if (modules.some((m) => m.appliance === 'sink600' || m.appliance === 'sink800')) {
    drafts.push({ key: 'faucet', title: 'Смеситель', unit: 'pcs', quantity: 1 });
  }

  /*
   * Модуль под мойку — отдельная работа: бездонный корпус и вырез под
   * сифон. Она есть в каждой кухне и раньше не считалась вовсе.
   */
  const sinkBases = modules.filter(isSinkBase).length;
  if (sinkBases > 0) {
    drafts.push({
      key: 'sink_base',
      title: 'Модуль под мойку (без дна, вырез)',
      unit: 'pcs',
      quantity: sinkBases,
    });
  }

  /*
   * Схлопываем строки с одинаковым ключом. Два модуля одного прибора обязаны
   * дать ОДНУ строку с количеством 2, а не две строки по одной цене: иначе
   * в смете появляются деньги, которых нет, и итог перестаёт сходиться
   * с составом ряда.
   */
  const merged = new Map<string, Draft>();
  for (const draft of drafts) {
    if (draft.quantity <= 0) continue;
    const existing = merged.get(draft.key);
    if (existing) {
      existing.quantity = round2(existing.quantity + draft.quantity);
    } else {
      merged.set(draft.key, { ...draft });
    }
  }

  return Array.from(merged.values());
}

function countertopTitle(kind: Run['options']['countertop']): string {
  if (kind === 'quartz') return 'кварцевый агломерат';
  if (kind === 'solid_wood') return 'массив';
  return 'ЛДСП';
}

/**
 * ЯЩИКИ ОТСЕКОВ (R02A.1) — ОЦЕНКА ОТДЕЛЬНО ОТ ПОДТВЕРЖДЁННОЙ ЦЕНЫ.
 *
 * Было (R02A): направляющие ящиков отсеков сливались в строку
 * «Направляющие (с доводчиками)» — как будто направляющую выбрали, — а
 * «Ящики в сборе» шли как рассчитанный короб. Ни то ни другое не
 * подтверждено: направляющая в блоке не выбрана, правил короба цеха нет.
 *
 * Теперь это свои строки со своим ключом: ставка — та же статья
 * (`rateKey`), деньги в итоге те же, но строка сказана оценкой и почему
 * (`estimated`). Выбрана направляющая из каталога — её строка по цене
 * позиции, как у фурнитуры модуля (`hardware_<позиция>_slides`), и это
 * уже не оценка. Короб — оценка всегда, пока у цеха нет правил короба.
 */
function bayDrawerDrafts(
  run: Run,
  hardwareItems: Map<string, HardwareItem>,
  production: ProductionSettings = DEFAULT_PRODUCTION,
): Draft[] {
  let drawers = 0;
  let unchosen = 0;
  let notInCatalog = 0;
  const chosen = new Map<string, { item: HardwareItem; count: number }>();

  for (const unit of allModules(run)) {
    for (const bay of unit.fill?.bays ?? []) {
      /* Блок в отсеке (R02A) или в его зоне (R02B) — одна и та же оценка. */
      const stack = bayDrawerStackOf(bay);
      if (!stack) continue;
      const count = drawerHeights(stack).length;
      drawers += count;
      const id = stack.slideItemId;
      const item = id ? hardwareItems.get(id) : undefined;
      if (item) {
        const entry = chosen.get(item.id) ?? { item, count: 0 };
        entry.count += count;
        chosen.set(item.id, entry);
      } else {
        unchosen += count;
        if (id) notInCatalog += count;
      }
    }
  }
  if (drawers === 0) return [];

  const hardwareClass = run.options.hardwareClass;
  const slideRate = `«Направляющие (${hardwareTitle(hardwareClass)})»`;
  const drafts: Draft[] = [];
  if (unchosen > 0) {
    drafts.push({
      key: 'bay_drawer_slide',
      title: 'Направляющие ящиков отсеков — не выбраны',
      unit: 'set',
      quantity: unchosen,
      rateKey: `slide_${hardwareClass}`,
      estimated:
        notInCatalog > 0
          ? `выбранной направляющей нет в каталоге организации — оценка по ставке ${slideRate}`
          : `направляющая не выбрана — оценка по ставке ${slideRate}`,
    });
  }
  for (const { item, count } of Array.from(chosen.values())) {
    /* Единица — по паспорту позиции производителя (`saleQuantity`); своя позиция компании — комплект на ящик. */
    const sale = saleQuantity(item, 'pair', count);
    drafts.push({
      key: `hardware_${item.id}_slides`,
      title: `${item.name} (направляющие)`,
      unit: sale.unit,
      quantity: sale.quantity,
      /*
       * Ноль в цене позиции — «цена не задана», а не бесплатная
       * направляющая (ловушка 452): строка с количеством, итог неполный.
       */
      ...(sale.unsure
        ? { priceUnset: sale.unsure }
        : Number.isFinite(item.price) && item.price > 0
          ? { rate: item.price }
          : { priceUnset: 'цена не задана: направляющую компания ещё не оценила' }),
    });
  }
  /*
   * КОРОБ РАССЧИТАН — ОЦЕНКИ НЕТ (HARDWARE-01): плита, распил и кромка
   * короба уже в строках материалов из раскроя. Оценкой остаются только
   * ящики без короба — их число, а не все ящики отсеков.
   */
  const boxed = allModules(run).reduce(
    (sum, unit) =>
      sum +
      moduleDrawerKits(unit, run, production, hardwareItems).filter((kit) => kit.state === 'box' && Boolean(kit.place.bayId)).length,
    0,
  );
  if (drawers - boxed > 0) {
    drafts.push({
      key: 'bay_drawer_box',
      title: 'Ящики отсеков в сборе — короб не рассчитан',
      unit: 'set',
      quantity: drawers - boxed,
      rateKey: 'drawer_box',
      estimated: 'короб не рассчитан: правил короба цеха нет — оценка по ставке «Ящик в сборе»',
    });
  }
  return drafts;
}

/**
 * ШТАНГИ ЗОН ОТСЕКОВ (R02B) — ОЦЕНКОЙ, А НЕ ЦЕНОЙ.
 *
 * Штанга из каталога не выбирается: артикула, сечения и держателей нет.
 * Поэтому строка своя (`bay_rod`), по ставке «Штанга для одежды» на
 * пролёт в свету отсека — та же длина, что рисуют сцена и лист
 * (`bayLayout`), — и сказана оценкой. Держатели — по два на штангу, по
 * ставке «Держатель штанги», тоже оценкой: какие держатели, никто не
 * выбирал. Прежние строки штанг секций (`wardrobe_rod`) не тронуты.
 */
function bayRodDrafts(run: Run, production: ProductionSettings, pantographBays: Set<string> = new Set()): Draft[] {
  let lengthMm = 0;
  let rods = 0;
  for (const unit of allModules(run)) {
    if (!unit.fill?.bays?.some((bay) => bay.zones?.some((zone) => zone.rod))) continue;
    for (const bay of bayLayout(unit, bayEnvelope(unit, run, production))?.bays ?? []) {
      /* Пантограф отсека — это и есть его штанга (HARDWARE-01): оплачен своей строкой. */
      if (pantographBays.has(`${unit.id}:${bay.id}`)) continue;
      for (const rod of bay.rods) {
        lengthMm += rod.lengthMm;
        rods += 1;
      }
    }
  }
  if (rods === 0) return [];
  return [
    {
      key: 'bay_rod',
      title: 'Штанги отсеков — штанга не выбрана',
      unit: 'mp',
      quantity: round2(lengthMm / MM_IN_M),
      rateKey: 'wardrobe_rod',
      estimated: 'штанга не выбрана из каталога — оценка по ставке «Штанга для одежды» на пролёт в свету отсека',
    },
    {
      key: 'bay_rod_holder',
      title: 'Держатели штанг отсеков — не выбраны',
      unit: 'pcs',
      quantity: 2 * rods,
      rateKey: 'rod_holder',
      estimated: 'держатели не выбраны — оценка по ставке «Держатель штанги», по два на штангу',
    },
  ];
}

function hardwareTitle(kind: Run['options']['hardwareClass']): string {
  if (kind === 'blum') return 'Blum';
  if (kind === 'soft_close') return 'с доводчиками';
  return 'стандарт';
}

/* ─────────────────────────  Итог  ───────────────────────── */

/** Доставка и монтаж считаются процентом от подытога, а не от корпуса. */
export const DELIVERY_KEY = 'delivery_install';

/**
 * Чья строка у площади детали со своим декором.
 *
 * `carcass` — корпус (и перегородки, у которых своего декора нет: они
 * часть корпуса, как и раньше). `partitions`, `shelves` — род детали со
 * СВОИМ декором (`run.carcass.partitions`, `run.carcass.shelves`): у него
 * своя строка, иначе выбор полкам «доехал» бы до раскроя и не доехал до
 * денег. Полки без своего декора здесь не считаются вовсе — они строкой
 * «Полки» по ставке цеха, как было всегда.
 */
type DecorLine = 'carcass' | 'shelves' | 'partitions';

/**
 * Площадь корпуса, у которого выбран СВОЙ материал.
 *
 * Считается из уже нарезанных панелей: второй расчёт площади ради новой
 * статьи развёл бы смету с раскроем. Берутся те же детали, которые
 * `panelMaterials` относит к корпусу.
 */
function carcassAreas(
  run: Run,
  panels: Panel[],
  catalog: Map<string, CarcassItem>,
): Map<string, { item: CarcassItem; m2: number; line: DecorLine }> {
  const out = new Map<string, { item: CarcassItem; m2: number; line: DecorLine }>();
  if (catalog.size === 0) return out;

  const byModule = new Map<string, Module>();
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    byModule.set(unit.id, unit);
  }

  for (const panel of panels) {
    if (panel.material.startsWith('ХДФ') || panel.material.startsWith('Фасад')) continue;
    const part = partOfPanel(panel.name);
    const ownPart = part !== null && Boolean(run.carcass?.[part]);
    if (part === 'shelves' && !ownPart) continue;
    const line: DecorLine = ownPart ? part! : 'carcass';

    const unit = byModule.get(panel.moduleId);
    if (!unit) continue;

    const link = carcassLink(unit, run, catalog, ownPart ? part! : undefined);
    /*
     * Позиция коллекции без цены тоже уходит своей строкой — с «цена не
     * задана»: подменить её ставкой цеха значит назвать клиенту цену
     * материала, которого никто не оценивал (слой 51).
     */
    const own =
      link.state === 'resolved' || (link.state === 'priceless' && Boolean(link.item.collection));
    if (!own) continue;

    const areaM2 = (panel.lengthMm * panel.widthMm * panel.qty) / 1_000_000;
    const key = `${line}:${link.item.id}`;
    const at = out.get(key);
    if (at) at.m2 += areaM2;
    else out.set(key, { item: link.item, m2: areaM2, line });
  }

  return out;
}

function pickedCarcassM2(
  run: Run,
  panels: Panel[],
  catalog: Map<string, CarcassItem>,
  lines: DecorLine[],
): number {
  let sum = 0;
  for (const { m2, line } of Array.from(carcassAreas(run, panels, catalog).values())) {
    if (lines.includes(line)) sum += m2;
  }
  return round2(sum);
}

/** Строка сметы декора: ключ и слово по роду детали. */
const DECOR_LINE: Record<DecorLine, { key: string; title: string }> = {
  carcass: { key: 'carcass', title: 'Корпус' },
  partitions: { key: 'partitions', title: 'Перегородки' },
  shelves: { key: 'shelves', title: 'Полки' },
};

/**
 * Строки корпуса своего декора: по одной на применённую позицию каталога.
 *
 * Площадь — из раскроя, цена — из позиции. Позиция без цены своей строки
 * не даёт вовсе и остаётся в общей: корпус за ничего клиенту не выдаём.
 */
function carcassDrafts(
  run: Run,
  panels: Panel[],
  catalog: Map<string, CarcassItem>,
  materialItems: Map<string, MaterialItem>,
  rates: RateTable,
): Draft[] {
  return Array.from(carcassAreas(run, panels, catalog).values())
    .sort((a, b) => a.line.localeCompare(b.line) || a.item.name.localeCompare(b.item.name, 'ru'))
    .map(({ item, m2, line }) => {
      const quantity = Math.round(m2 * 100) / 100;
      const word = DECOR_LINE[line];
      const base = { key: `${word.key}_${item.id}`, unit: 'm2' as const, quantity };
      if (!item.collection) return { ...base, title: `${word.title} «${item.name}»`, rate: item.price };

      /*
       * ПОЗИЦИЯ КОЛЛЕКЦИИ НА КОРПУСЕ — ТА ЖЕ ФУНКЦИЯ ЦЕНЫ, ЧТО У ФАСАДОВ.
       *
       * Своя цена позиции, иначе цена коллекции. Поверхности у корпуса не
       * выбирают, поэтому цена коллекции берётся по ПЕРВОЙ поверхности
       * коллекции, и строка сметы её называет: цена за другую поверхность
       * не подставляется молча.
       */
      const material = materialItems.get(item.id);
      const surface = material?.finishes[0];
      const surfaceTitle = surface ? MATERIAL_FINISHES[surface]?.label ?? surface : null;
      const price = material
        ? priceState(material, surface, 'm2', rates)
        : { state: 'unset' as const, reason: item.priceNote ?? 'цена не задана' };
      return {
        ...base,
        title: `${word.title} «${item.name}»${surfaceTitle ? `, ${surfaceTitle}` : ''}`,
        ...(price.state === 'priced' ? { rate: price.rate } : { priceUnset: price.reason }),
      };
    });
}

/**
 * ПЛОЩАДЬ ФАСАДОВ ПО ПОЗИЦИЯМ КОЛЛЕКЦИЙ — ИЗ УЖЕ НАРЕЗАННЫХ ПАНЕЛЕЙ.
 *
 * Какая позиция у фасада, говорит `FrontSpec.itemId` модуля — то же поле,
 * по которому сцена красит пачку. Позиции нет среди коллекций — фасад
 * остаётся в общей строке по ставке цеха, как и раньше.
 */
function frontMaterialAreas(
  run: Run,
  panels: Panel[],
  catalog: Map<string, MaterialItem>,
): Map<string, { item: MaterialItem; surface: string | undefined; m2: number }> {
  const out = new Map<string, { item: MaterialItem; surface: string | undefined; m2: number }>();
  if (catalog.size === 0) return out;

  const byModule = new Map<string, Module>();
  for (const unit of allModules(run)) byModule.set(unit.id, unit);

  for (const panel of panels) {
    if (!panel.material.startsWith('Фасад')) continue;
    const unit = byModule.get(panel.moduleId);
    if (!unit) continue;

    /* Фасад строки — её створки (P3D-MDF, `frontLeaf`), иначе модуля. */
    const spec = leafFrontOf(unit, panel.frontLeaf ?? null);
    const item = spec.itemId ? catalog.get(spec.itemId) : undefined;
    if (!item) continue;

    const key = `${item.id}${spec.surface ? `_${spec.surface}` : ''}`;
    const areaM2 = (panel.lengthMm * panel.widthMm * panel.qty) / MM2_IN_M2;
    const at = out.get(key);
    if (at) at.m2 += areaM2;
    else out.set(key, { item, surface: spec.surface, m2: areaM2 });
  }

  return out;
}

function pickedFrontM2(run: Run, panels: Panel[], catalog: Map<string, MaterialItem>): number {
  let sum = 0;
  for (const { m2 } of Array.from(frontMaterialAreas(run, panels, catalog).values())) sum += m2;
  return round2(sum);
}

/** Строки фасадов из коллекций: по позиции и поверхности, цена — у позиции. */
function frontMaterialDrafts(
  run: Run,
  panels: Panel[],
  catalog: Map<string, MaterialItem>,
  rates: RateTable,
): Draft[] {
  return Array.from(frontMaterialAreas(run, panels, catalog).entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { item, surface, m2 }]) => {
      const price = priceState(item, surface, 'm2', rates);
      const finish = surface ? MATERIAL_FINISHES[surface]?.label : undefined;
      return {
        key: `front_item_${key}`,
        title: `Фасады ${item.code}${item.name ? ` «${item.name}»` : ''}${finish ? `, ${finish}` : ''}`,
        unit: 'm2' as const,
        quantity: round2(m2),
        ...(price.state === 'priced' ? { rate: price.rate } : { priceUnset: price.reason }),
      };
    });
}

/**
 * Строки фрезеровки: по одной на каждую применённую позицию каталога.
 *
 * Площадь берётся из УЖЕ НАРЕЗАННЫХ панелей и группируется по модулю:
 * какая фрезеровка у модуля, отвечает `millingFor` внутри `millingLink` —
 * та же функция, что называет её в деталировке и на чертеже.
 */
function millingDrafts(
  run: Run,
  panels: Panel[],
  catalog: Map<string, MillingItem>,
): Draft[] {
  if (catalog.size === 0) return [];

  const byModule = new Map<string, Module>();
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    byModule.set(unit.id, unit);
  }

  /** Площадь фасадов, разложенная по позиции фрезеровки. */
  const areaByMilling = new Map<string, { item: MillingItem; m2: number }>();

  for (const panel of panels) {
    if (!panel.material.startsWith('Фасад')) continue;

    const unit = byModule.get(panel.moduleId);
    if (!unit) continue;

    const link = millingLink(unit, run, catalog, panel.frontLeaf ?? null);
    if (link.state !== 'resolved') continue;

    const areaM2 = (panel.lengthMm * panel.widthMm * panel.qty) / 1_000_000;
    const at = areaByMilling.get(link.item.id);
    if (at) at.m2 += areaM2;
    else areaByMilling.set(link.item.id, { item: link.item, m2: areaM2 });
  }

  return Array.from(areaByMilling.values())
    .sort((a, b) => a.item.name.localeCompare(b.item.name, 'ru'))
    .map(({ item, m2 }) => ({
      key: `front_milling_${item.id}`,
      title: `Фрезеровка «${item.name}»`,
      unit: 'm2' as const,
      quantity: Math.round(m2 * 100) / 100,
      rate: item.price,
    }));
}

/**
 * ФРЕЗЕРОВКА РИСУНКА МДФ (P3D-MDF): площадь есть, цены нет.
 *
 * Рельеф VISUAL_ONLY — чертежа фрезы и цены цеха нет, и выдумывать её
 * нельзя. Но и промолчать нельзя: компания подписала бы договор без
 * операции, которую придётся делать. Площадь — из раскроя (те же панели
 * «Фасад…», что у строки «Фасады»), строка с количеством и без денег,
 * итог «неполный». Гладкий (A) — не фрезеровка, строки нет. Фасад, у
 * которого фрезеровка с ценой из каталога (`millingDrafts`), её не
 * дублирует.
 */
function reliefDrafts(run: Run, panels: Panel[], catalog: Map<string, MillingItem>): Draft[] {
  const byModule = new Map<string, Module>();
  for (const unit of allModules(run)) byModule.set(unit.id, unit);

  const areas = new Map<string, { title: string; m2: number }>();
  for (const panel of panels) {
    if (!panel.material.startsWith('Фасад')) continue;
    const unit = byModule.get(panel.moduleId);
    if (!unit) continue;
    const leaf = panel.frontLeaf ?? null;
    const relief = leafFrontOf(unit, leaf).relief;
    if (!relief || relief.kind === 'slab') continue;
    if (catalog.size > 0 && millingLink(unit, run, catalog, leaf).state === 'resolved') continue;

    const key = `${relief.kind}${relief.model ? `_${relief.model.replace(/[^A-Za-z0-9]+/g, '_')}` : ''}`;
    const title = `Фрезеровка «${reliefKindDef(relief.kind).title}»${relief.model ? ` (по модели ${relief.model})` : ''} — ${RELIEF_STATUS}`;
    const areaM2 = (panel.lengthMm * panel.widthMm * panel.qty) / MM2_IN_M2;
    const at = areas.get(key);
    if (at) at.m2 += areaM2;
    else areas.set(key, { title, m2: areaM2 });
  }

  return Array.from(areas.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { title, m2 }]) => ({
      key: `front_relief_${key}`,
      title,
      unit: 'm2' as const,
      quantity: round2(m2),
      priceUnset: 'рисунок для показа: чертежа фрезы и цены цеха нет — цену задаёт цех',
    }));
}

export function buildEstimate(
  run: Run,
  variant: VariantKey,
  rates: RateTable,
  disabledKeys: string[] = [],
  calculatedAt = '1970-01-01T00:00:00.000Z',
  /*
   * Настройки цеха — те же, что у листа раскроя. Умолчание общее с
   * `buildPanels`: разойтись они могут только если кто-то передаст
   * production в одну функцию и не передаст в другую.
   */
  production: ProductionSettings = DEFAULT_PRODUCTION,
  /** Фурнитура организации: цены выбранных позиций. Пусто — как раньше. */
  hardwareItems: Map<string, HardwareItem> = new Map(),
  /** Фрезеровки организации: цены выбранных позиций. Пусто — как раньше. */
  millingItems: Map<string, MillingItem> = new Map(),
  /** Материалы корпуса организации: цены выбранных позиций. Пусто — как раньше. */
  carcassItems: Map<string, CarcassItem> = new Map(),
  /** Позиции коллекций каталога материалов. Пусто — как раньше. */
  materialItems: Map<string, MaterialItem> = new Map(),
  /**
   * СНИМОК ЦЕН — ДЛЯ КАБИНЕТА КЛИЕНТА (слой 52).
   *
   * Клиент видит ту сумму, что ему назвали: переоценка каталога после
   * отправки её не меняет (ловушка 30). Снимок держит ставку КАЖДОЙ строки
   * по её ключу — и ставки цеха, и цену позиции, фрезеровки, корпуса и
   * коллекции. Строка, которой в снимке нет, считается как на экране.
   * Экран дизайнера снимка не передаёт: он считает по каталогу.
   */
  options: { frozen?: Record<string, number> } = {},
): Estimate {
  const drafts = buildEstimateDrafts(
    run,
    production,
    hardwareItems,
    millingItems,
    carcassItems,
    materialItems,
    rates,
  );
  const frozen = options.frozen;
  const inSnapshot = (key: string) =>
    frozen !== undefined && Object.prototype.hasOwnProperty.call(frozen, key);
  /** Ставка статьи: из снимка, если он есть, иначе из каталога. */
  const rateOf = (key: string) => (inSnapshot(key) ? frozen![key] : rates[key]);
  const disabled = new Set(disabledKeys);
  const priceSnapshot: Record<string, number> = {};

  const lines: EstimateLine[] = drafts.map((draft) => {
    /*
     * Цена позиции каталога сильнее типовой ставки статьи: её выбрала
     * организация именно для этого модуля. Второго места хранения при
     * этом не появляется — в снимок цен она попадает тем же полем, что
     * и остальные, и подписанный документ её удержит (ловушка 30).
     */
    /*
     * ЦЕНА НЕ ЗАДАНА — В СТРОКЕ НОЛЬ, НО НЕ «НОЛЬ ТЕНГЕ».
     *
     * Ставкой цеха такую строку не закрыть: это чужая цена. Строка
     * остаётся с количеством, её сумма в итог не входит, и итог помечен
     * «неполный» (`unpricedLines`), а экран вместо суммы пишет причину.
     */
    /*
     * Строка с ценой позиции (своя, фрезеровка, корпус, коллекция) в
     * снимке держит ту ставку, что была при отправке. Ноль там — «цена не
     * задана» на тот момент: бесплатного материала не бывает, и он не
     * превращается в «0 ₸» оттого, что цену завели позже.
     */
    const itemPriced = draft.rate !== undefined || draft.priceUnset !== undefined;
    /* Ставка — по ключу статьи (`rateKey`), снимок — по ключу строки. */
    const rateKey = draft.rateKey ?? draft.key;
    let priceUnset = draft.priceUnset;
    let rate: number;
    if (inSnapshot(draft.key)) {
      rate = frozen![draft.key];
      if (itemPriced) priceUnset = rate > 0 ? undefined : (draft.priceUnset ?? PRICE_UNSET);
    } else {
      rate = draft.priceUnset ? 0 : (draft.rate ?? rates[rateKey] ?? 0);
    }
    /* Нет ставки статьи вида стекла — цена не задана словами, а не ноль (V3D-02). */
    if (draft.unsetWithoutRate && (inSnapshot(draft.key) ? !(frozen![draft.key] > 0) : rates[rateKey] === undefined)) {
      priceUnset = draft.unsetWithoutRate;
    }
    if (priceUnset) rate = 0;
    priceSnapshot[draft.key] = rate;

    // Крепёж задаётся процентом от стоимости корпуса, а не ценой за м².
    const isPercent = draft.unit === 'percent';
    const carcassRate = rateOf('ldsp_carcass') ?? 0;
    const carcassQty = drafts.find((d) => d.key === 'ldsp_carcass')?.quantity ?? 0;

    const total = isPercent
      ? round2((carcassRate * carcassQty * rate) / 100)
      : round2(draft.quantity * rate);

    return {
      id: draft.key,
      key: draft.key,
      title: draft.title,
      unit: draft.unit,
      quantity: draft.quantity,
      rate,
      total,
      enabled: !disabled.has(draft.key),
      missingRate:
        !priceUnset &&
        draft.rate === undefined &&
        (inSnapshot(draft.key) ? frozen![draft.key] : rates[rateKey]) === undefined,
      ...(priceUnset ? { priceUnset } : {}),
      ...(draft.estimated ? { estimated: draft.estimated } : {}),
    };
  });

  const subtotal = lines
    .filter((l) => l.enabled)
    .reduce((sum, l) => sum + l.total, 0);

  const deliveryRate = rateOf(DELIVERY_KEY) ?? 0;
  priceSnapshot[DELIVERY_KEY] = deliveryRate;

  if (deliveryRate > 0) {
    lines.push({
      id: DELIVERY_KEY,
      key: DELIVERY_KEY,
      title: 'Доставка и монтаж',
      unit: 'percent',
      quantity: round2(deliveryRate),
      rate: deliveryRate,
      total: round2((subtotal * deliveryRate) / 100),
      enabled: !disabled.has(DELIVERY_KEY),
    });
  }

  const total = round2(
    lines.filter((l) => l.enabled).reduce((sum, l) => sum + l.total, 0),
  );

  return { variant, lines, total, priceSnapshot, calculatedAt, fingerprint: run.fingerprint };
}

/** Пересчёт итога после снятия галочек — без обращения к каталогу. */
export function recalcTotal(estimate: Estimate, disabledKeys: string[]): Estimate {
  const disabled = new Set(disabledKeys);
  const lines = estimate.lines.map((l) => ({ ...l, enabled: !disabled.has(l.key) }));

  const withoutDelivery = lines.filter((l) => l.key !== DELIVERY_KEY && l.enabled);
  const subtotal = withoutDelivery.reduce((sum, l) => sum + l.total, 0);

  const withDelivery = lines.map((l) =>
    l.key === DELIVERY_KEY
      ? { ...l, total: round2((subtotal * l.rate) / 100) }
      : l,
  );

  const total = round2(
    withDelivery.filter((l) => l.enabled).reduce((sum, l) => sum + l.total, 0),
  );

  return { ...estimate, lines: withDelivery, total };
}

/**
 * СТРОКИ БЕЗ ЦЕНЫ, ИЗ-ЗА КОТОРЫХ ИТОГ НЕПОЛНЫЙ.
 *
 * Снятая галочка строку из счёта убирает: её не покупают, и итог по
 * ней неполным не становится.
 */
export function unpricedLines(estimate: Pick<Estimate, 'lines'>): EstimateLine[] {
  return estimate.lines.filter((line) => line.enabled && Boolean(line.priceUnset));
}

/**
 * СТРОКИ ОЦЕНКИ (R02A.1): деньги в итоге есть, но это не подтверждённая
 * цена — направляющая не выбрана, короб не рассчитан. Экран называет их
 * сумму отдельно от итога и помечает итог «с оценкой».
 */
export function estimatedLines(estimate: Pick<Estimate, 'lines'>): EstimateLine[] {
  return estimate.lines.filter((line) => line.enabled && Boolean(line.estimated));
}

/** Что писать в колонке суммы: причину вместо «0 ₸». */
export function lineAmountText(line: EstimateLine): string {
  return line.priceUnset ? line.priceUnset : `${formatMoney(line.total)} ₸`;
}

/**
 * Подпись у итога: «Итого · неполный», если хоть у одной позиции нет цены.
 *
 * Итог без этой пометки клиент примет за цену кухни, а в нём нет денег
 * за материал, которого никто не оценил.
 */
export function totalCaption(estimate: Pick<Estimate, 'lines' | 'preliminary'>): string {
  const parts = ['Итого'];
  if (estimate.preliminary) parts.push('предварительно');
  if (estimatedLines(estimate).length > 0) parts.push('с оценкой');
  if (unpricedLines(estimate).length > 0) parts.push('неполный');
  return parts.join(' · ');
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

export const UNIT_LABEL_MW: Record<EstimateUnit, string> = {
  m2: 'м²',
  mp: 'м.п.',
  pcs: 'шт',
  set: 'компл.',
  percent: '%',
};
