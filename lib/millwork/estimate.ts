import {
  APPLIANCE_SLOTS,
  BUILT_IN_FRIDGE_FRONTS,
  hingesPerDoor,
  moduleAppliances,
  standsOnFloor,
} from './modules';
import { allModules } from './layout';
import { bearsCountertop, moduleCarcassHeightMm } from './fill';
import { CORNER_HINGE_TITLE, liftKey, openingHardware } from './opening';
import { buildPanels, panelMaterials } from './panels';
import { DEFAULT_PRODUCTION, type HardwareItem, type ProductionSettings } from '@/types/catalog';
import { resolveHardware } from './hardware';
import { SLIDING_DOOR, displayLedMeters, sectionSpec, slidingDoorCount } from './sections';
import { MODULE_VARIANTS, isSinkBase, variantEstimateKeys } from './moduleVariants';
import { zoneProfile } from './zones';
import type {
  Estimate,
  EstimateLine,
  EstimateUnit,
  Module,
  Run,
  VariantKey,
} from '@/types/millwork';

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
function sectionDrafts(run: Run): Draft[] {
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

      case 'drawers':
        drafts.push({
          key: 'drawer_box',
          title: 'Ящики в сборе',
          unit: 'set',
          quantity: unit.fill?.drawerHeights.length || unit.drawerCount || spec.drawerCount,
        });
        break;

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

export function buildEstimateDrafts(
  run: Run,
  production: ProductionSettings = DEFAULT_PRODUCTION,
  /**
   * Фурнитура организации. Пусто — расчёт ровно такой, каким был до
   * каталога: ни одна существующая смета от появления параметра не
   * меняется.
   */
  hardwareItems: Map<string, HardwareItem> = new Map(),
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
  const materials = panelMaterials(buildPanels({ run, production }));

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
  );

  let hinges = hardware.hinges;
  let slides = 0;

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
    if (pick) {
      /*
       * Петли этого модуля — из того же разреза, что и итог ряда: числа
       * накоплены одним циклом, и вычитание не может увести их в минус.
       */
      const own = hardware.byModule[unit.id]?.hinges ?? 0;
      pick.hinges += own;
      hinges -= own;
    }

    if (unit.frontType === 'drawers') {
      /*
       * ЧИСЛО ЯЩИКОВ — ОДНА ВЕЛИЧИНА, И ЖИВЁТ ОНА В `fill`.
       *
       * Здесь стоял запасной путь `|| unit.drawerCount`, и он был не
       * подстраховкой, а ВТОРЫМ определением: пока `fill` оставался
       * пустым после `set_fronts`, раскрой давал ноль фронтов, а смета
       * по этому запасному числу выписывала три направляющие.
       *
       * Высоты фронтов — то, по чему режется раскрой; направляющая
       * ставится на фронт. Спрашиваем ровно это, и фурнитуры без панелей
       * не получается в принципе.
       */
      const drawers = unit.fill?.drawerHeights.length ?? 0;
      if (pick) pick.slides += drawers;
      else slides += drawers;
    }

    /*
     * Петли для встройки: фасад висит на дверце прибора, а не на корпусе,
     * и комплект у них свой. Без этой строки встроенный холодильник стоил
     * бы столько же, сколько отдельностоящий, — а разница ощутимая.
     */
    if (unit.builtIn) {
      const h = moduleCarcassHeightMm(unit, run);
      hinges += BUILT_IN_FRIDGE_FRONTS * hingesPerDoor(h / BUILT_IN_FRIDGE_FRONTS);
    }
  }

  // Столешница: длина ряда плюс запил на угол, если ряд угловой.
  const hasCorner = run.modules.some((m) => m.kind === 'corner_base');

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
  const counterMp = round3(
    run.modules
      .filter((unit) => bearsCountertop(unit, run))
      .reduce((sum, unit) => sum + unit.widthMm, 0) / MM_IN_M,
  );

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
    { key: carcassKey, title: carcassTitle, unit: 'm2', quantity: materials.carcassM2 },
    /*
     * ПОЛКИ ОТДЕЛЬНОЙ СТРОКОЙ — одна на весь ряд, по `fill.shelves`.
     *
     * Строка есть всегда, даже при нуле: пропадёт при нуле — и «полок нет»
     * станет неотличимо от «полки забыли посчитать». Ровно так эта ошибка
     * и прожила: в корпус была зашита одна полка на модуль, и её никто
     * не видел.
     */
    { key: 'shelf_panel', title: 'Полки', unit: 'm2', quantity: materials.shelfM2 },
    { key: 'hdf_back', title: 'Задние стенки ХДФ', unit: 'm2', quantity: materials.backM2 },
    { key: 'front_panel', title: 'Фасады', unit: 'm2', quantity: materials.frontM2 },
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
    drafts.push({
      key: `countertop_${run.options.countertop}`,
      title: `Столешница (${countertopTitle(run.options.countertop)})`,
      unit: 'mp',
      quantity: counterMp,
    });

    if (hasCorner) {
      drafts.push({ key: 'countertop_miter', title: 'Запил столешницы на угол', unit: 'pcs', quantity: 1 });
    }

    drafts.push({
      key: 'countertop_plinth',
      title: 'Плинтус столешницы',
      unit: 'mp',
      quantity: counterMp,
    });
  }

  if (zone.hasApron) {
    drafts.push({
      key: 'wall_panel',
      title: 'Стеновая панель (фартук)',
      unit: 'mp',
      quantity: run.options.hasUpper ? counterMp : 0,
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
      quantity: hardware.lifts,
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
    ...(hardware.handleBar > 0
      ? [
          {
            key: 'handle_standard',
            title: 'Ручки накладные',
            unit: 'pcs' as const,
            quantity: hardware.handleBar,
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
    // Четыре регулируемые опоры на каждый нижний модуль.
    { key: 'leg_support', title: 'Опоры регулируемые', unit: 'pcs', quantity: floorModules.length * 4 },
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

    drafts.push(
      {
        key: 'glass_front',
        title: 'Стеклянная дверь в раме',
        unit: 'm2',
        quantity: round2((unit.widthMm * h) / MM2_IN_M2),
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
    for (const key of variantEstimateKeys(unit)) {
      const spec = MODULE_VARIANTS[unit.variant!];
      drafts.push({
        key,
        title: `${spec.title} (${unit.widthMm} мм)`,
        unit: key === 'glass_front' ? 'm2' : 'pcs',
        quantity:
          key === 'glass_front'
            ? round2(
                (unit.widthMm * moduleCarcassHeightMm(unit, run)) / MM2_IN_M2,
              )
            : 1,
      });
    }
  }

  drafts.push(...sectionDrafts(run));

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

function hardwareTitle(kind: Run['options']['hardwareClass']): string {
  if (kind === 'blum') return 'Blum';
  if (kind === 'soft_close') return 'с доводчиками';
  return 'стандарт';
}

/* ─────────────────────────  Итог  ───────────────────────── */

/** Доставка и монтаж считаются процентом от подытога, а не от корпуса. */
export const DELIVERY_KEY = 'delivery_install';

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
): Estimate {
  const drafts = buildEstimateDrafts(run, production, hardwareItems);
  const disabled = new Set(disabledKeys);
  const priceSnapshot: Record<string, number> = {};

  const lines: EstimateLine[] = drafts.map((draft) => {
    /*
     * Цена позиции каталога сильнее типовой ставки статьи: её выбрала
     * организация именно для этого модуля. Второго места хранения при
     * этом не появляется — в снимок цен она попадает тем же полем, что
     * и остальные, и подписанный документ её удержит (ловушка 30).
     */
    const rate = draft.rate ?? rates[draft.key] ?? 0;
    priceSnapshot[draft.key] = rate;

    // Крепёж задаётся процентом от стоимости корпуса, а не ценой за м².
    const isPercent = draft.unit === 'percent';
    const carcassRate = rates.ldsp_carcass ?? 0;
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
      missingRate: draft.rate === undefined && rates[draft.key] === undefined,
    };
  });

  const subtotal = lines
    .filter((l) => l.enabled)
    .reduce((sum, l) => sum + l.total, 0);

  const deliveryRate = rates[DELIVERY_KEY] ?? 0;
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
