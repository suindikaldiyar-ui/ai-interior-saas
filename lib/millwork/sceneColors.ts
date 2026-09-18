import type { BoxMaterial } from './cabinetBoxes';

/**
 * ЦВЕТ ПО РОЛИ ДЕТАЛИ — ОДНА ТАБЛИЦА НА СЦЕНУ.
 *
 * В САПР-виде деталь узнают по тону: корпус светлее фасада, внутренности
 * светлее корпуса, столешница своим цветом, цоколь темнее всех. Пока
 * цвета жили прямо в материалах компонента, проверить их было нечем — а
 * «всё одного серого» это ровно то, чего никто не измерял.
 *
 * Здесь они лежат данными, и проверка спрашивает ту же таблицу, что
 * красит сцену. Плотный цвет, без градиентов и бликов: блик на фасаде
 * заставляет клиента выбирать цвет по блику, а привезут ему плиту
 * (ловушка 299).
 *
 * Артикул каталога красит ФАСАД поверх этого — роль отвечает на другой
 * вопрос: что это за деталь, когда материал ещё не выбран.
 */

export type ScenePalette = {
  facade: string;
  carcass: string;
  counter: string;
};

/** Тот же цвет, но темнее: цоколь и тени в нишах. */
export function darkenHex(hex: string, amount: number): string {
  return mixHex(hex, '#000000', amount);
}

/** Тот же цвет, но светлее: внутренности корпуса. */
export function lightenHex(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', amount);
}

function mixHex(hex: string, to: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(to);
  const k = Math.min(1, Math.max(0, amount));

  const mixed = a.map((channel, i) => Math.round(channel + (b[i] - channel) * k));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Прибор и металл своего тона: они не мебель и материалом каталога не
 * красятся. Тёмный корпус прибора — это его цвет, а не «нет данных».
 */
export const APPLIANCE_COLOR = '#2A2C2E';
export const METAL_COLOR = '#9AA0A6';
export const GLASS_COLOR = '#8FB2C4';

/**
 * Цвет каждой роли при этой палитре.
 *
 * Роли `front` и `counter` перекрашиваются артикулом, если он выбран;
 * остальные — нет. Но даже без единого выбранного материала все шесть
 * тонов обязаны отличаться друг от друга: иначе сцена читается одной
 * серой плитой, что и было.
 */
export function roleColors(palette: ScenePalette): Record<BoxMaterial, string> {
  return {
    carcass: darkenHex(palette.carcass, 0.08),
    inner: lightenHex(palette.carcass, 0.18),
    front: palette.facade,
    metal: METAL_COLOR,
    appliance: APPLIANCE_COLOR,
    glass: GLASS_COLOR,
  };
}

/**
 * Цоколь: темнее корпуса, на нём держится нижняя тень.
 *
 * Было 0.15 — четырнадцать единиц канала от корпуса, то есть при
 * повороте цоколь сливался с ним в одну плиту, и мебель переставала
 * «стоять». Тёмная полоса внизу и есть то, что ставит ряд на пол.
 */
export function plinthColor(palette: ScenePalette): string {
  return darkenHex(palette.carcass, 0.34);
}

/** Столешница: своя роль, своё число — её цвет не выводится из корпуса. */
export function counterColor(palette: ScenePalette): string {
  return palette.counter;
}
