/**
 * СЛОИ 3D (P1) — ЧТО ПОКАЗАНО, А НЕ ЧТО СДЕЛАНО.
 *
 * Корпус, перегородки, полки, ящики, фасады и фурнитура включаются и
 * выключаются независимо. Это состояние ВИДА: оно не меняет ни ряда, ни
 * раскроя, ни сметы и в объект не пишется — живёт в сторе сцены рядом с
 * открытыми створками и выделением (CLAUDE.md, «Источник правды»).
 *
 * Слой коробки решает одна функция (`boxLayer` в `cabinetBoxes.ts`) по
 * признакам, которые коробка уже несёт: роль материала, имя детали
 * раскроя, ключ подвижной детали, узел фурнитуры. Здесь — только
 * названия, наборы и предустановки; модуль без three.js, его читают и
 * кнопки над сценой, и приёмка.
 */

/*
 * ТЕХНИКА (ЭТАП 3) — свой слой: варочная, духовой шкаф и прочие приборы — не
 * корпус и не фурнитура. До этапа коробки приборов шли слоем корпуса.
 */
export type SceneLayer = 'carcass' | 'partitions' | 'shelves' | 'drawers' | 'fronts' | 'hardware' | 'appliances';

export const SCENE_LAYERS: readonly SceneLayer[] = ['carcass', 'partitions', 'shelves', 'drawers', 'fronts', 'hardware', 'appliances'];

export const SCENE_LAYER_TITLE: Record<SceneLayer, string> = {
  carcass: 'Корпус',
  partitions: 'Перегородки',
  shelves: 'Полки',
  drawers: 'Ящики',
  fronts: 'Фасады',
  hardware: 'Фурнитура',
  appliances: 'Техника',
};

export type SceneLayers = Record<SceneLayer, boolean>;

export const ALL_LAYERS: SceneLayers = {
  carcass: true,
  partitions: true,
  shelves: true,
  drawers: true,
  fronts: true,
  hardware: true,
  appliances: true,
};

/**
 * ПРЕДУСТАНОВКИ ВИДА. Предустановка ставит набор слоёв; слои дальше
 * правятся по одному, и тогда набор называется «свой».
 *
 * «Рентген» (прозрачный корпус, рёбра внутренних деталей) — НЕ
 * предустановка: это прежний переключатель разреза (`cutaway`), и
 * включается он только им. В «Дизайн» прозрачность не протекает:
 * выбор «Дизайн» разрез снимает.
 */
export type ScenePreset = 'design' | 'frame' | 'fill' | 'fronts' | 'hardware';

export const SCENE_PRESETS: readonly { key: ScenePreset; title: string; note: string; layers: SceneLayers }[] = [
  {
    key: 'design',
    title: 'Дизайн',
    note: 'Готовая мебель: фасады закрыты и непрозрачны.',
    layers: ALL_LAYERS,
  },
  {
    key: 'frame',
    title: 'Каркас',
    note: 'Корпус и перегородки без фасадов и наполнения.',
    layers: { carcass: true, partitions: true, shelves: false, drawers: false, fronts: false, hardware: false, appliances: false },
  },
  {
    key: 'fill',
    title: 'Наполнение',
    note: 'Только содержимое: полки, перегородки, ящики, штанги — без корпуса и фасадов.',
    layers: { carcass: false, partitions: true, shelves: true, drawers: true, fronts: false, hardware: true, appliances: false },
  },
  {
    key: 'fronts',
    title: 'Фасады',
    note: 'Фасады и их фурнитура без корпуса: видно, что открывается.',
    layers: { carcass: false, partitions: false, shelves: false, drawers: false, fronts: true, hardware: true, appliances: false },
  },
  {
    key: 'hardware',
    title: 'Фурнитура',
    note: 'Только фурнитура: петли, ручки, штанги — условные узлы, не артикулы.',
    layers: { carcass: false, partitions: false, shelves: false, drawers: false, fronts: false, hardware: true, appliances: false },
  },
];

export function presetLayers(preset: ScenePreset): SceneLayers {
  const found = SCENE_PRESETS.find((item) => item.key === preset);
  if (!found) throw new Error(`Предустановки вида «${preset}» нет.`);
  return { ...found.layers };
}

/** Какой предустановке равен набор слоёв; не равен ни одной — `null` («свой набор»). */
export function presetOf(layers: SceneLayers): ScenePreset | null {
  const found = SCENE_PRESETS.find((item) => SCENE_LAYERS.every((layer) => item.layers[layer] === layers[layer]));
  return found ? found.key : null;
}
