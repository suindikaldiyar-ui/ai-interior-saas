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
export function viewWidthMm(realWidthMm: number, den: number): number {
  return (realWidthMm / den) * (DRAW_FIELD.total / DRAW_FIELD.draw);
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
};

export type SheetPage = { views: SheetView[] };

/** Высота подписи вида на бумаге: строка заголовка плюс воздух под ней. */
export const VIEW_CAPTION_MM = 7;

/** Промежуток между видами на листе. */
export const VIEW_GAP_MM = 8;

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
 * ОДИН МАСШТАБ НА ЛИСТ.
 *
 * У проектировщика на листе один масштаб на все метрические виды: глаз
 * перестраивается один раз, и размеры сравниваются между видами напрямую.
 * Поэтому масштаб выбирается не по каждому виду отдельно, а по всей
 * компоновке: берём самый крупный стандартный, при котором лист ещё
 * складывается в одну страницу.
 *
 * Не сложился ни один — отдаём самый мелкий и разбиваем на листы честно.
 */
export function fitComposition(
  build: (den: ScaleDenominator) => SheetView[],
  format: SheetFormat,
): { den: ScaleDenominator; pages: SheetPage[] } {
  let last: { den: ScaleDenominator; pages: SheetPage[] } | null = null;

  for (const den of STANDARD_SCALES) {
    const views = build(den);
    const field = sheetField(format);
    // Вид шире поля не спасёт никакая раскладка: это уже другой масштаб.
    if (views.some((view) => view.widthMm > field.width)) continue;

    const pages = paginate(views, format);
    last = { den, pages };
    if (pages.length === 1) return last;
  }

  const den = STANDARD_SCALES[STANDARD_SCALES.length - 1];
  return last ?? { den, pages: paginate(build(den), format) };
}

/** «Лист 2 из 3» — на каждом листе свой номер, штамп одинаковый. */
export function sheetNumber(index: number, total: number): string {
  return `Лист ${index + 1} из ${total}`;
}
