import { FRONT_BASES, frontOf } from './frontMaterial';
import type { FrontBase, FrontFinish, FrontSpec, Module } from '@/types/millwork';

/**
 * КАК ВЫГЛЯДИТ МАТЕРИАЛ ФАСАДА НА ПЛОСКОЙ СХЕМЕ.
 *
 * Клиент должен понимать, что перед ним дуб, а не абстрактная панель.
 * Контур этого не говорит: белая эмаль и шпон на чертеже — один и тот же
 * прямоугольник.
 *
 * ОТКУДА КАРТИНКА. Ровно два источника, и оба принадлежат компании:
 *
 *   1. Артикул каталога организации — файл `texture` или `swatch`,
 *      загруженный ею самой в Storage. Он и есть настоящий образец.
 *   2. Артикул не выбран — ПРОЦЕДУРНЫЙ образец: цвет плюс рисунок,
 *      выведенный из базы материала. Рисуется тут же, из чисел.
 *
 * Третьего источника нет намеренно. Чужие фотографии, положенные в
 * репозиторий, — это образцы ЧУЖИХ поставщиков: компания показала бы
 * клиенту плиту, которую не продаёт, и объяснялась бы на замере.
 */

/** Рисунок поверхности. Не текстура из файла, а способ её изобразить. */
export type SwatchPattern =
  | 'grain'
  | 'speck'
  | 'flat'
  | 'sheen'
  | 'plain';

export type FrontSwatch = {
  /** Основной цвет: из артикула, иначе типовой для этой базы. */
  color: string;
  pattern: SwatchPattern;
  /** Насколько рисунок заметен: 0 — гладкая плита, 1 — выраженный шпон. */
  strength: number;
  /** Файл образца из каталога компании. Пусто — рисуем процедурно. */
  imageUrl: string | null;
  /** Подпись под карточкой: «Эмаль, глянец». */
  title: string;
};

/**
 * Цвета по умолчанию — не «красиво», а узнаваемо.
 *
 * ЛДСП на рынке чаще всего светло-серая корпусная, плёнка — тёплая
 * белая, эмаль — чистая белая, акрил — глубокий тёмный глянец, шпон —
 * дуб. Это то, что человек ожидает увидеть, услышав название.
 */
const BASE_COLOR: Record<FrontBase, string> = {
  ldsp: '#D9D4C8',
  mdf_film: '#E6E2D8',
  mdf_enamel: '#F1EFEA',
  acrylic: '#33383D',
  veneer_solid: '#B08A57',
};

/**
 * Рисунок по базе.
 *
 * Шпон и ЛДСП различаются именно им: у первого волокно, у второй —
 * мелкая крошка декора. Эмаль и акрил гладкие, и это тоже признак: их
 * узнают по отсутствию рисунка и по блику.
 */
const BASE_PATTERN: Record<FrontBase, SwatchPattern> = {
  ldsp: 'speck',
  mdf_film: 'flat',
  mdf_enamel: 'plain',
  acrylic: 'sheen',
  veneer_solid: 'grain',
};

/** Глянец добавляет блик поверх любого рисунка, мат его убирает. */
const FINISH_STRENGTH: Record<FrontFinish, number> = {
  gloss: 0.55,
  matte: 0.85,
  textured: 1,
};

const HEX = /^#[0-9a-f]{6}$/i;

export function frontSwatch(spec: FrontSpec, imageUrl: string | null = null): FrontSwatch {
  const base = FRONT_BASES[spec.base];

  return {
    color: HEX.test(spec.colorHex ?? '') ? spec.colorHex! : BASE_COLOR[spec.base],
    // Глянцевая поверхность бликует независимо от базы: это видно первым.
    pattern: spec.finish === 'gloss' ? 'sheen' : BASE_PATTERN[spec.base],
    strength: FINISH_STRENGTH[spec.finish],
    imageUrl,
    title: `${base.title}, ${spec.finish === 'gloss' ? 'глянец' : spec.finish === 'matte' ? 'мат' : 'текстура'}`,
  };
}

/** Образец модуля: у техники без фасада его нет вовсе. */
export function moduleSwatch(unit: Module, imageUrl: string | null = null): FrontSwatch | null {
  if (unit.appliance && !unit.builtIn) return null;
  return frontSwatch(frontOf(unit), imageUrl);
}

/**
 * Ключ образца: по нему схема заводит рисунок ОДИН раз на материал, а не
 * на модуль. Ряд из тринадцати модулей одного цвета — это один рисунок.
 */
export function swatchKey(swatch: FrontSwatch): string {
  return `${swatch.color.replace('#', '')}-${swatch.pattern}-${Math.round(swatch.strength * 100)}`;
}

/**
 * Светлее или темнее того же цвета — для прожилок и бликов.
 *
 * Рисунок обязан оставаться В ЦВЕТЕ плиты: контрастная штриховка поверх
 * дуба читается как брак печати, а не как текстура.
 */
export function shade(hex: string, amount: number): string {
  const value = HEX.test(hex) ? hex : '#888888';
  const n = parseInt(value.slice(1), 16);
  const to = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);

  const mix = (channel: number) => Math.round(channel + (to - channel) * k);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
