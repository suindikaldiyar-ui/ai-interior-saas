import {
  APPLIANCE_SLOTS,
  moduleAppliances,
  standsOnFloor,
} from './modules';
import { allModules } from './layout';
import { countertopLengthMm } from './countertop';
import { moduleCarcassHeightMm } from './fill';
import { CORNER_HINGE_TITLE, drawerSlides, liftKey, openingHardware } from './opening';
import { buildPanels, panelMaterials, SHELF_PANEL_NAME} from './panels';
import { DEFAULT_PRODUCTION, type HardwareItem, type ProductionSettings } from '@/types/catalog';
import { resolveHardware } from './hardware';
import { SLIDING_DOOR, displayLedMeters, sectionSpec, slidingDoorCount } from './sections';
import { MODULE_VARIANTS, isSinkBase, variantEstimateKeys } from './moduleVariants';
import { zoneProfile } from './zones';
import { millingLink, type MillingItem } from './milling';
import { carcassLink, type CarcassItem } from './carcassMaterial';
import { frontOf } from './frontMaterial';
import { MATERIAL_FINISHES } from './materialFinishes';
import { PRICE_UNSET, priceState, type MaterialItem } from './materialCollection';
import type {
  Estimate,
  EstimateLine,
  EstimateUnit,
  Module,
  Run,
  VariantKey, Panel,
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
  /**
   * ЦЕНА ПОЗИЦИИ НЕ ЗАДАНА — строка есть, денег в ней нет, и это сказано.
   *
   * Только у позиций коллекций каталога материалов (слой 51): их ставкой
   * цеха не подменить — эмаль по RAL не стоит как типовой фасад.
   */
  priceUnset?: string;
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
  const panels = buildPanels({ run, production, milling: millingItems });
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
      const drawers = drawerSlides(unit);
      if (pick) pick.slides += drawers;
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
  const hasCorner =
    run.modules.some((m) => m.kind === 'corner_base') || run.corner?.ahead === true;

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
      quantity: round2(Math.max(0, materials.carcassM2 - pickedCarcassM2(run, panels, carcassItems))),
    },
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
    if (hasCorner && counterMp > 0) {
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
): Map<string, { item: CarcassItem; m2: number }> {
  const out = new Map<string, { item: CarcassItem; m2: number }>();
  if (catalog.size === 0) return out;

  const byModule = new Map<string, Module>();
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    byModule.set(unit.id, unit);
  }

  for (const panel of panels) {
    if (panel.material.startsWith('ХДФ') || panel.material.startsWith('Фасад')) continue;
    if (panel.name === SHELF_PANEL_NAME) continue;

    const unit = byModule.get(panel.moduleId);
    if (!unit) continue;

    const link = carcassLink(unit, run, catalog);
    /*
     * Позиция коллекции без цены тоже уходит своей строкой — с «цена не
     * задана»: подменить её ставкой цеха значит назвать клиенту цену
     * материала, которого никто не оценивал (слой 51).
     */
    const own =
      link.state === 'resolved' || (link.state === 'priceless' && Boolean(link.item.collection));
    if (!own) continue;

    const areaM2 = (panel.lengthMm * panel.widthMm * panel.qty) / 1_000_000;
    const at = out.get(link.item.id);
    if (at) at.m2 += areaM2;
    else out.set(link.item.id, { item: link.item, m2: areaM2 });
  }

  return out;
}

function pickedCarcassM2(
  run: Run,
  panels: Panel[],
  catalog: Map<string, CarcassItem>,
): number {
  let sum = 0;
  for (const { m2 } of Array.from(carcassAreas(run, panels, catalog).values())) sum += m2;
  return round2(sum);
}

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
    .sort((a, b) => a.item.name.localeCompare(b.item.name, 'ru'))
    .map(({ item, m2 }) => {
      const quantity = Math.round(m2 * 100) / 100;
      const base = { key: `carcass_${item.id}`, unit: 'm2' as const, quantity };
      if (!item.collection) return { ...base, title: `Корпус «${item.name}»`, rate: item.price };

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
        title: `Корпус «${item.name}»${surfaceTitle ? `, ${surfaceTitle}` : ''}`,
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

    const spec = frontOf(unit);
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

    const link = millingLink(unit, run, catalog);
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
    let priceUnset = draft.priceUnset;
    let rate: number;
    if (inSnapshot(draft.key)) {
      rate = frozen![draft.key];
      if (itemPriced) priceUnset = rate > 0 ? undefined : (draft.priceUnset ?? PRICE_UNSET);
    } else {
      rate = draft.priceUnset ? 0 : (draft.rate ?? rates[draft.key] ?? 0);
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
      missingRate: !priceUnset && draft.rate === undefined && rateOf(draft.key) === undefined,
      ...(priceUnset ? { priceUnset } : {}),
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
