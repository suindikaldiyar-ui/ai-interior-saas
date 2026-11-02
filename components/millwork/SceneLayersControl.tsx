'use client';

import { useEffect, useState } from 'react';
import { armSoundUnlock, setSoundPrefs, soundPrefs, unlockMechanismSound } from './cabinet3d/mechanismSound';
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
  /* Звуки механизмов (фаза 4): выбор устройства, по умолчанию выключены; включение — жест, будит звук браузера. */
  const [sound, setSound] = useState(() => soundPrefs());
  const [soundSaved, setSoundSaved] = useState(true);
  const changeSound = (next: { on: boolean; volume: number }) => {
    setSound(next);
    setSoundSaved(setSoundPrefs(next));
    if (next.on) unlockMechanismSound();
  };
  useEffect(() => armSoundUnlock(), []);
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
          <button
            type="button"
            data-scene-sound
            aria-pressed={sound.on}
            onClick={() => changeSound({ ...sound, on: !sound.on })}
            className={`mw-btn ${sound.on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            title="Звуки дверей, ящиков, подъёмников, сушки и пантографа при открывании и закрывании — синтез, не записи. Выбор этого устройства."
          >
            Звуки механизмов: {sound.on ? 'Вкл' : 'Выкл'}
          </button>
          {sound.on ? (
            <label className="flex items-center gap-1 text-[13px] text-graphiteMw">
              <span>Громкость</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                data-scene-sound-volume
                value={Math.round(sound.volume * 100)}
                onChange={(e) => changeSound({ ...sound, volume: Number(e.target.value) / 100 })}
              />
            </label>
          ) : null}
          {!soundSaved ? <span className="text-[13px] text-graphiteMw">выбор не сохранится: хранилище браузера недоступно</span> : null}
        </div>
      )}
    </div>
  );
}
