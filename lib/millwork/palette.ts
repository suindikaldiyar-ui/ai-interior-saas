import { textureUrl } from '@/lib/catalog';
import type { CatalogEntryFull } from '@/types/catalog';
import type { FrontBase } from '@/types/millwork';

/**
 * ПАЛИТРА ЦВЕТОВ ФАСАДА — ИЗ КАТАЛОГА ОРГАНИЗАЦИИ.
 *
 * Клиент работает с МДФ и просит цвет. Цвета лежали в коде — восемь
 * шестнадцатеричных чисел в готовых дизайнах, — и это цвета НАШИ, а не
 * компании: у неё свой поставщик, свой прайс и свои декоры. Показать
 * клиенту «графит #3A3D40», которого компания не продаёт, — это заказ,
 * который она не сможет выполнить.
 *
 * Отдельной таблицы под палитру нет и не будет (ловушка 19): цвет — это
 * ТОВАР, и живёт он в `catalog_items` с остальными. Признак — `meta`:
 *
 *   meta.frontBase  из чего фасад: `ldsp`, `mdf_enamel`, `acrylic`…
 *   meta.color      `#rrggbb`, тот же ключ, что читает `surfaces.ts`
 *   meta.typical    позиция из типовой поставки, а не своя
 *
 * Картинка образца — файл `texture` или `swatch` товара в Storage, тот
 * же, что подставляется в 3D. Второго источника картинок нет: разошлись
 * бы карточка и схема.
 */

export type PaletteColor = {
  /** Артикул каталога: он и пишется в `FrontSpec.itemId`. */
  itemId: string;
  article: string;
  name: string;
  colorHex: string;
  /** Для какой базы этот цвет. Эмаль по RAL и плёнка — разные товары. */
  base: FrontBase;
  /** Файл образца компании. Пусто — рисуем процедурно. */
  imageUrl: string | null;
  /**
   * Позиция из типовой поставки.
   *
   * Типовой прайс подписан как ориентир, и палитра подписана так же:
   * компания обязана видеть, где её товар, а где наш пример.
   */
  typical: boolean;
  /** Цена за м², если задана: разница между декорами бывает заметной. */
  price: number;
};

const HEX = /^#[0-9a-f]{6}$/i;

const BASES: FrontBase[] = ['ldsp', 'mdf_film', 'mdf_enamel', 'acrylic', 'veneer_solid'];

function metaString(entry: CatalogEntryFull, key: string): string {
  const value = entry.meta?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Палитра компании: только те товары, у которых есть база и цвет.
 *
 * Товар без `meta.color` — это не цвет, а материал вообще: он остаётся
 * ставкой сметы и в палитру не попадает. Порядок устойчивый — по базе,
 * потом по названию: список цветов не должен прыгать между открытиями.
 */
export function paletteFromCatalog(items: CatalogEntryFull[]): PaletteColor[] {
  const colors: PaletteColor[] = [];

  for (const item of items) {
    if (item.is_active === false) continue;

    const base = metaString(item, 'frontBase') as FrontBase;
    const colorHex = metaString(item, 'color');
    if (!BASES.includes(base) || !HEX.test(colorHex)) continue;

    colors.push({
      itemId: item.id,
      article: item.article,
      name: item.name_ru,
      colorHex,
      base,
      imageUrl: textureUrl(item),
      typical: item.meta?.typical === true,
      price: Number(item.price) || 0,
    });
  }

  return colors.sort(
    (a, b) => BASES.indexOf(a.base) - BASES.indexOf(b.base) || a.name.localeCompare(b.name, 'ru'),
  );
}

/** Цвета одной базы: эмаль по RAL не показывают там, где выбрана плёнка. */
export function paletteFor(colors: PaletteColor[], base: FrontBase): PaletteColor[] {
  return colors.filter((color) => color.base === base);
}

export function paletteColorById(
  colors: PaletteColor[],
  itemId: string | undefined,
): PaletteColor | null {
  if (!itemId) return null;
  return colors.find((color) => color.itemId === itemId) ?? null;
}

/* ────────────────  Типовая палитра  ──────────────── */

export type TypicalColor = {
  article: string;
  name: string;
  colorHex: string;
  base: FrontBase;
  price: number;
};

/**
 * ТИПОВАЯ ПАЛИТРА — ОРИЕНТИР, А НЕ ПРАЙС КОМПАНИИ.
 *
 * Ровно та же роль, что у типового прайса: дать компании начать работу в
 * первый день и быть ЯВНО помеченной как чужая. Эмаль по RAL — потому
 * что её называют номером и номер один на весь рынок; плёнка и ЛДСП —
 * ходовые декоры, которые есть почти у каждого поставщика.
 *
 * Цены — средние по рынку и подписаны ориентиром. Заведённые компанией
 * позиции не трогаются никогда (ловушка 46).
 */
export const TYPICAL_PALETTE: TypicalColor[] = [
  // ── Эмаль по RAL: её заказывают номером ──
  { article: 'CLR-RAL-9003', name: 'RAL 9003 сигнальный белый', colorHex: '#F4F4F0', base: 'mdf_enamel', price: 26000 },
  { article: 'CLR-RAL-9010', name: 'RAL 9010 чисто-белый', colorHex: '#F1EDE4', base: 'mdf_enamel', price: 26000 },
  { article: 'CLR-RAL-7047', name: 'RAL 7047 светло-серый', colorHex: '#C8C8C7', base: 'mdf_enamel', price: 26000 },
  { article: 'CLR-RAL-7016', name: 'RAL 7016 антрацит', colorHex: '#383E42', base: 'mdf_enamel', price: 27000 },
  { article: 'CLR-RAL-6021', name: 'RAL 6021 бледно-зелёный', colorHex: '#89AC76', base: 'mdf_enamel', price: 27000 },
  { article: 'CLR-RAL-5008', name: 'RAL 5008 серо-синий', colorHex: '#26364B', base: 'mdf_enamel', price: 27000 },
  { article: 'CLR-RAL-1015', name: 'RAL 1015 светлая слоновая кость', colorHex: '#E6D2B5', base: 'mdf_enamel', price: 26000 },
  { article: 'CLR-RAL-8017', name: 'RAL 8017 шоколадно-коричневый', colorHex: '#442F29', base: 'mdf_enamel', price: 27000 },

  // ── Плёночный МДФ: ходовые декоры ──
  { article: 'CLR-FILM-WHITE', name: 'Белый софт-тач', colorHex: '#EFEDE6', base: 'mdf_film', price: 18000 },
  { article: 'CLR-FILM-GREY', name: 'Серый камень', colorHex: '#A9A69C', base: 'mdf_film', price: 18000 },
  { article: 'CLR-FILM-SAGE', name: 'Шалфей', colorHex: '#8E9285', base: 'mdf_film', price: 18500 },
  { article: 'CLR-FILM-GRAPHITE', name: 'Графит', colorHex: '#40444A', base: 'mdf_film', price: 18500 },

  // ── ЛДСП: корпусные декоры ──
  { article: 'CLR-LDSP-WHITE', name: 'Белый', colorHex: '#EDEAE3', base: 'ldsp', price: 9500 },
  { article: 'CLR-LDSP-SONOMA', name: 'Дуб сонома', colorHex: '#C3A177', base: 'ldsp', price: 9800 },
  { article: 'CLR-LDSP-CRAFT', name: 'Дуб крафт золотой', colorHex: '#B08A57', base: 'ldsp', price: 9800 },
  { article: 'CLR-LDSP-ANTHRACITE', name: 'Антрацит', colorHex: '#3A3D40', base: 'ldsp', price: 9800 },

  // ── Акрил: глянец, который узнают по блику ──
  { article: 'CLR-ACR-WHITE', name: 'Акрил белый глянец', colorHex: '#F6F6F4', base: 'acrylic', price: 34000 },
  { article: 'CLR-ACR-BLACK', name: 'Акрил чёрный глянец', colorHex: '#2E3338', base: 'acrylic', price: 34000 },

  // ── Шпон ──
  { article: 'CLR-VEN-OAK', name: 'Шпон дуба натуральный', colorHex: '#9A7449', base: 'veneer_solid', price: 42000 },
  { article: 'CLR-VEN-WALNUT', name: 'Шпон ореха', colorHex: '#6B4A32', base: 'veneer_solid', price: 45000 },
];

/** Позиция типовой палитры в виде товара каталога. */
export function typicalColorItem(color: TypicalColor) {
  return {
    article: color.article,
    name_ru: color.name,
    name_kk: color.name,
    price: color.price,
    unit: 'm2' as const,
    categoryKey: 'materials',
    meta: {
      frontBase: color.base,
      color: color.colorHex,
      /*
       * Пометка «типовая». Компания обязана видеть, где её товар, а где
       * наш пример: молча выданная чужая палитра — это обещание цвета,
       * которого у неё нет.
       */
      typical: true,
    },
  };
}
