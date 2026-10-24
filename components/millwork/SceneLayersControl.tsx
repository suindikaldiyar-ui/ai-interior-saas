'use client';

import { useState } from 'react';
import { useInteriorStore } from '@/store/useInteriorStore';
import {
  SCENE_LAYERS,
  SCENE_LAYER_TITLE,
  SCENE_PRESETS,
  presetOf,
  type SceneLayer,
} from '@/lib/millwork/sceneLayers';

/**
 * ВИД 3D (P1): ПРЕДУСТАНОВКИ И СЛОИ.
 *
 * «Дизайн · Каркас · Наполнение · Фасады · Фурнитура» ставят набор слоёв,
 * «Слои» открывают шесть переключателей по одному. Всё это — состояние
 * вида в сторе сцены: ряд, раскрой и смета от него не меняются, объект не
 * пишется (автосохранение смотрит на состав, а не на сцену).
 *
 * Слой, которого в ряду нет вовсе (ящиков нет — нечего показывать),
 * не притворяется работающим: кнопка закрыта и говорит «нет в ряду».
 * Счёт — `counts`, по той же `boxLayer`, что прячет коробки в сцене.
 *
 * «Рентген» (прозрачный корпус) — прежний переключатель разреза, он живёт
 * рядом и в «Дизайн» не протекает: выбор «Дизайн» его снимает.
 *
 * «Экономичный режим» (HARDWARE-PHOTO-PERF-01) — тоже настройка вида, но
 * не объекта, а устройства: слабый ноутбук или планшет. Плотность пикселей
 * 1, без теней и карты окружения, картинки библиотеки и превью фурнитуры —
 * по нажатию. По умолчанию выключен.
 */
export default function SceneLayersControl({ counts }: { counts: Partial<Record<SceneLayer, number>> }) {
  const layers = useInteriorStore((state) => state.sceneLayers);
  const setLayers = useInteriorStore((state) => state.setSceneLayers);
  const setCutaway = useInteriorStore((state) => state.setCutaway);
  const economy = useInteriorStore((state) => state.economyMode);
  const setEconomy = useInteriorStore((state) => state.setEconomyMode);
  const [open, setOpen] = useState(false);
  const preset = presetOf(layers);

  /*
   * Предустановки — одним списком, а не пятью кнопками: полоса над сценой
   * на 390 px прокручивается, а на планшете переносится и накрывает
   * мебель (ловушка 327). Список виден всегда и подписан «Вид».
   */
  const current = SCENE_PRESETS.find((item) => item.key === preset);
  return (
    /* С `md` — не шире полосы над сценой: раскрытые слои переносятся, а не ложатся на «На весь экран». */
    <div
      className="flex shrink-0 flex-wrap items-center gap-1 md:min-w-0 md:max-w-full md:shrink"
      data-scene-layers-group
      data-scene-preset-current={preset ?? 'custom'}
    >
      <label className="flex items-center gap-1 text-[13px] text-graphiteMw">
        <span>Вид</span>
        <select
          data-scene-preset-select
          value={preset ?? 'custom'}
          title={current?.note ?? 'Свой набор слоёв'}
          onChange={(event) => {
            const item = SCENE_PRESETS.find((entry) => entry.key === event.target.value);
            if (!item) return;
            setLayers(item.layers);
            if (item.key === 'design') setCutaway(false);
          }}
          className="mw-field h-11 min-h-0 min-w-[9.5rem] py-0"
        >
          {SCENE_PRESETS.map((item) => (
            <option key={item.key} value={item.key} data-scene-preset={item.key}>
              {item.title}
            </option>
          ))}
          {preset === null && (
            <option value="custom" disabled>
              Свой набор
            </option>
          )}
        </select>
      </label>
      <button
        type="button"
        data-scene-layers-toggle
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="mw-btn mw-btn-ghost"
        title="Корпус, перегородки, полки, ящики, фасады и фурнитура — по одному"
      >
        {preset === null ? 'Слои · свой набор' : 'Слои'}
      </button>
      {open && (
        <div className="flex flex-wrap gap-1" data-scene-layers role="group" aria-label="Слои 3D">
          {SCENE_LAYERS.map((layer) => {
            const count = counts[layer] ?? 0;
            const empty = count === 0;
            return (
              <button
                key={layer}
                type="button"
                data-scene-layer={layer}
                data-layer-count={count}
                aria-pressed={layers[layer] && !empty}
                disabled={empty}
                title={empty ? `${SCENE_LAYER_TITLE[layer]}: в этом ряду нет — показывать нечего` : undefined}
                onClick={() => setLayers({ ...layers, [layer]: !layers[layer] })}
                className={`mw-btn ${layers[layer] && !empty ? 'mw-btn-primary' : 'mw-btn-ghost'} disabled:opacity-40`}
              >
                {SCENE_LAYER_TITLE[layer]}
                {empty ? ' · нет в ряду' : ''}
              </button>
            );
          })}
          <button
            type="button"
            data-scene-economy
            aria-pressed={economy}
            onClick={() => setEconomy(!economy)}
            className={`mw-btn ${economy ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            title="Для слабого ноутбука и планшета: плотность пикселей 1, без теней и карты окружения, картинки библиотеки и превью фурнитуры — по нажатию. Мебель, раскрой и смета не меняются."
          >
            Экономичный режим
          </button>
        </div>
      )}
    </div>
  );
}
