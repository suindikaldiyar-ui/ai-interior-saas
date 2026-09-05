/**
 * ЧЕРТЁЖНЫЙ ЛИСТ: МАСШТАБ, ПОЛЯ, РАЗБИВКА ПО ЛИСТАМ.
 *
 * До этого чертёж просто растягивался по ширине экрана: на бумаге он был
 * «примерно такой», и снять с него размер линейкой было нельзя. Проектировщик
 * такой лист не примет — а инструмент мы продаём именно ему.
 *
 * Здесь масштаб НАСТОЯЩИЙ: при 1:25 тысяча миллиметров мебели занимает на
 * бумаге сорок миллиметров. Отсюда и разбивка на листы: что не помещается по
 * высоте поля, уходит на второй лист со своим номером, а не ужимается,
 * пока не станет нечитаемым.
 */

/**
 * Внутренняя геометрия видов в условных единицах SVG.
 *
 * У фасада и плана поле рисунка 640 единиц, слева поле под высотные отметки,
 * справа воздух. Отсюда пересчёт: сколько миллиметров бумаги занимает вид
 * целиком, если сама мебель идёт в заданном масштабе.
 */
export const DRAW_FIELD = { padLeft: 74, draw: 640, padRight: 26, total: 740 } as const;

/**
 * Стандартный ряд масштабов.
 *
 * Мебельные чертежи живут в этих пяти: 1:10 для узла, 1:50 для длинной
 * прихожей. Промежуточные вроде 1:23 не бывают — по ним нельзя мерить
 * линейкой, а именно этим на объекте и занимаются.
 */
export const STANDARD_SCALES = [10, 20, 25, 30, 50] as const;
export type ScaleDenominator = (typeof STANDARD_SCALES)[number];

/** «1:25» — подпись под видом. */
export function scaleLabel(den: number): string {
  return `1:${den}`;
}

/**
 * Самый крупный стандартный масштаб, при котором вид влезает в поле.
 *
 * Крупнее — читаемее, поэтому берём первый подходящий из ряда. Не влез даже
 * 1:50 — отдаём 1:50: уменьшать дальше некуда, зато подпись честная, и видно,
 * что вид просится на отдельный лист.
 */
export function fitScale(
  realMm: { width: number; height: number },
  fieldMm: { width: number; height: number },
): ScaleDenominator {
  for (const den of STANDARD_SCALES) {
    if (realMm.width / den <= fieldMm.width && realMm.height / den <= fieldMm.height) {
      return den;
    }
  }
  return STANDARD_SCALES[STANDARD_SCALES.length - 1];
}

/**
 * Ширина ВИДА на бумаге в миллиметрах.
 *
 * Мебель занимает `realWidthMm / den`, но у вида есть ещё поля под отметки
 * и воздух справа — они масштабируются вместе с ним, иначе размерная цепочка
 * поедет относительно рисунка.
 */
export function viewWidthMm(
  realWidthMm: number,
  den: number,
  totalUnits: number = DRAW_FIELD.total,
): number {
  return (realWidthMm / den) * (totalUnits / DRAW_FIELD.draw);
}

/* ─────────────────────────  Форматы листа  ───────────────────────── */

export type SheetFormat = 'A4' | 'A3';

/** Альбомная ориентация: чертёж ряда шире, чем выше, всегда. */
export const SHEET_SIZE: Record<SheetFormat, { width: number; height: number }> = {
  A4: { width: 297, height: 210 },
  A3: { width: 420, height: 297 },
};

/** Поля листа. Десять миллиметров — то, что не срежет ни один принтер. */
export const SHEET_MARGIN_MM = 10;

/** Место под примечания и штамп внизу каждого листа. */
export const SHEET_FOOTER_MM = 46;

export function sheetField(format: SheetFormat): { width: number; height: number } {
  const size = SHEET_SIZE[format];
  return {
    width: size.width - SHEET_MARGIN_MM * 2,
    height: size.height - SHEET_MARGIN_MM * 2 - SHEET_FOOTER_MM,
  };
}

/**
 * Формат под состав.
 *
 * A3 по умолчанию: на нём помещаются фасад, разрезы, план и аксонометрия
 * разом, ради чего лист и затевался. Короткий ряд без верхних шкафов
 * читается и на A4 — печатать его на A3 значит тратить бумагу компании.
 */
export function chooseFormat(input: {
  lengthMm: number;
  views: number;
}): SheetFormat {
  const short = input.lengthMm <= 2000 && input.views <= 3;
  return short ? 'A4' : 'A3';
}

/* ─────────────────────────  Разбивка по листам  ───────────────────────── */

/** Вид на листе: сколько бумаги он занимает. */
export type SheetView = {
  id: string;
  title: string;
  /** Габарит вида НА БУМАГЕ, миллиметры. */
  widthMm: number;
  heightMm: number;
  /** Начинать с новой строки: так идёт план под фасадом. */
  breakRow?: boolean;
  /**
   * Начинать НОВЫЙ ЛИСТ.
   *
   * Аксонометрия — не метрический вид: по ней не мерят, и делить лист с
   * фасадом и разрезами ей незачем. Отдельный лист держит первый чистым:
   * на нём только то, по чему снимают размеры.
   */
  breakPage?: boolean;
};

export type SheetPage = { views: SheetView[] };

/** Высота подписи вида на бумаге: строка заголовка плюс воздух под ней. */
export const VIEW_CAPTION_MM = 7;

/**
 * ПОЛЯ ВОКРУГ ВИДА — не меньше 15 мм бумаги.
 *
 * Восьми не хватало: виды стояли впритык, размерные цепи одного залезали
 * в поле соседнего, и лист читался как интерфейс, где всё прижато друг
 * к другу. На бумаге между блоками нужен воздух — по нему глаз и понимает,
 * что это два разных вида, а не один сложный.
 *
 * Не помещается — уменьшается МАСШТАБ вида, а не поля: поля здесь такая же
 * часть документа, как рамка и штамп.
 */
export const VIEW_GAP_MM = 15;

/**
 * Раскладка видов по листам.
 *
 * Виды становятся в строку, пока хватает ШИРИНЫ поля: фасад и оба разреза
 * помещаются рядом, и лист используется целиком. Не хватило высоты —
 * начинается следующий лист: ужимать чертёж, чтобы «влезло», нельзя,
 * масштаб перестанет быть масштабом.
 */
export function paginate(views: SheetView[], format: SheetFormat): SheetPage[] {
  const field = sheetField(format);
  const pages: SheetPage[] = [];

  let page: SheetView[] = [];
  let used = 0;
  let row: SheetView[] = [];
  let rowWidth = 0;
  let rowHeight = 0;

  const closeRow = () => {
    if (row.length === 0) return;
    page.push(...row);
    used += rowHeight;
    row = [];
    rowWidth = 0;
    rowHeight = 0;
  };

  const closePage = () => {
    closeRow();
    if (page.length > 0) pages.push({ views: page });
    page = [];
    used = 0;
  };

  for (const view of views) {
    const height = view.heightMm + VIEW_CAPTION_MM;
    const width = view.widthMm;

    // Вид, который открывает лист, закрывает предыдущий целиком.
    if (view.breakPage && page.length + row.length > 0) closePage();

    const fitsRow =
      !view.breakRow &&
      row.length > 0 &&
      rowWidth + VIEW_GAP_MM + width <= field.width &&
      used + Math.max(rowHeight, height) <= field.height;

    if (fitsRow) {
      row.push(view);
      rowWidth += VIEW_GAP_MM + width;
      rowHeight = Math.max(rowHeight, height);
      continue;
    }

    closeRow();
    if (used + height > field.height && page.length > 0) closePage();

    row = [view];
    rowWidth = width;
    rowHeight = height;
  }

  closePage();
  return pages.length > 0 ? pages : [{ views: [] }];
}

/**
 * ОДИН МАСШТАБ НА ЛИСТ, И ОН НЕ МЕЛЬЧЕ 1:30.
 *
 * У проектировщика на листе один масштаб на все метрические виды: глаз
 * перестраивается один раз, и размеры сравниваются между видами напрямую.
 * Это правило осталось.
 *
 * А вот второе — «самый крупный масштаб, при котором лист ОДИН» — отменено.
 * Оно экономило бумагу за счёт читаемости: раскладка «один вид — один блок»
 * не складывается на A3 в одну страницу крупнее 1:50, и фасад трёхметровой
 * кухни занимал 124 мм на поле в 400 мм. Формально один лист, а по существу
 * крошечный рисунок в море пустой бумаги — ровно то, из-за чего чертёж и
 * не выглядел документом.
 *
 * ДЕЙСТВУЮЩЕЕ ПРАВИЛО: масштаб НЕ МЕЛЬЧЕ `MIN_SCALE_DEN`, а листов столько,
 * сколько нужно. Комплект из двух-трёх листов — норма отрасли; нечитаемый
 * лист нормой не является. Среди допустимых берём тот, что даёт меньше
 * листов, при равенстве — более крупный.
 *
 * Предел уступает ровно одному обстоятельству: вид, который не влезает в
 * ширину поля, был бы ОБРЕЗАН. Обрезанный чертёж хуже мелкого, поэтому
 * ради него масштаб уходит за 1:30.
 */
/**
 * Предел мелкости: 1:30.
 *
 * Мельче лист перестаёт читаться как документ — по нему не снять размер
 * и не разглядеть наполнение. Уступает только обрезанию вида.
 */
export const MIN_SCALE_DEN: ScaleDenominator = 30;

export function fitComposition(
  build: (den: ScaleDenominator) => SheetView[],
  format: SheetFormat,
): { den: ScaleDenominator; pages: SheetPage[] } {
  const field = sheetField(format);

  /** Вид шире поля был бы обрезан — такой масштаб не годится ни при чём. */
  const fits = (views: SheetView[]) => views.every((view) => view.widthMm <= field.width);

  let best: { den: ScaleDenominator; pages: SheetPage[] } | null = null;

  for (const den of STANDARD_SCALES) {
    if (den > MIN_SCALE_DEN) break;

    const views = build(den);
    if (!fits(views)) continue;

    const pages = paginate(views, format);
    // Меньше листов лучше; при равенстве выигрывает первый, то есть
    // самый крупный — ряд идёт от крупного к мелкому.
    if (!best || pages.length < best.pages.length) best = { den, pages };
  }

  if (best) return best;

  /*
   * Крупнее 1:30 ничего не поместилось по ШИРИНЕ: очень длинный ряд.
   * Уходим мельче предела — обрезанный вид хуже мелкого.
   */
  for (const den of STANDARD_SCALES) {
    const views = build(den);
    if (fits(views)) return { den, pages: paginate(views, format) };
  }

  const den = STANDARD_SCALES[STANDARD_SCALES.length - 1];
  return { den, pages: paginate(build(den), format) };
}

/**
 * МАСШТАБ ВИДА, КОТОРЫЙ ПРИСТРАИВАЕТСЯ К ГОТОВОМУ ЛИСТУ.
 *
 * Аксонометрия — не метрический вид: по ней не мерят, она отвечает на
 * вопрос «как это стоит вместе». Тянуть из-за неё весь лист в 1:50 значит
 * испортить те виды, по которым как раз мерят. Поэтому у неё свой масштаб:
 * самый крупный, при котором лист ещё складывается в одну страницу.
 */
export function fitExtra(
  base: SheetView[],
  build: (den: ScaleDenominator) => SheetView[],
  format: SheetFormat,
): { den: ScaleDenominator; pages: SheetPage[] } {
  const field = sheetField(format);

  for (const den of STANDARD_SCALES) {
    const extra = build(den);
    /*
     * Объёмный вид стоит на СВОЁМ листе, поэтому критерий простой: влезть
     * в поле целиком. Раньше здесь ждали, что весь комплект сложится в одну
     * страницу, — с отдельным листом под аксонометрию это не случается
     * никогда, и масштаб молча падал до самого мелкого из ряда.
     */
    const fitsField = extra.every(
      (view) => view.widthMm <= field.width && view.heightMm + VIEW_CAPTION_MM <= field.height,
    );
    /*
     * Оба объёмных вида — ОДНОЙ ПАРОЙ на одном листе: закрытый и с
     * наполнением читают, сравнивая друг с другом. Разнеси их по листам —
     * и сравнивать придётся, листая.
     */
    if (fitsField && paginate(extra, format).length === 1) {
      return { den, pages: paginate([...base, ...extra], format) };
    }
  }

  const den = STANDARD_SCALES[STANDARD_SCALES.length - 1];
  return { den, pages: paginate([...base, ...build(den)], format) };
}

/** «Лист 2 из 3» — на каждом листе свой номер, штамп одинаковый. */
export function sheetNumber(index: number, total: number): string {
  return `Лист ${index + 1} из ${total}`;
}
