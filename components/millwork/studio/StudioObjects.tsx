'use client';

import type { KnownState } from '@/types/survey';

/**
 * ОБЪЕКТЫ ПРОЕКТА СПИСКОМ — ИНСТРУМЕНТ «ВЫБОР» (STAGE 01B).
 *
 * Стены замера и модули выбранной стены одним списком: выбор отсюда — тот
 * же выбор, что нажатием на плане или на фасаде, и инспектор справа один.
 * Список ничего не считает: стены — из замера, модули — из того же ряда,
 * что рисуют сцена и раскрой.
 */

type Props = {
  walls: { id: string; label: string; lengthMm: number | null; state: KnownState }[];
  modules: { id: string; label: string; offsetMm: number; widthMm: number }[];
  /** Чья мебель показана: «Стена А · w1». */
  modulesOf: string;
  selectedWallId: string | null;
  selectedModuleId: string | null;
  onSelectWall: (wallId: string) => void;
  onSelectModule: (moduleId: string) => void;
};

export default function StudioObjects({
  walls,
  modules,
  modulesOf,
  selectedWallId,
  selectedModuleId,
  onSelectWall,
  onSelectModule,
}: Props) {
  return (
    <div className="grid gap-4" data-studio-objects>
      <div>
        <p className="mw-label mb-1">Стены замера</p>
        <ul className="grid gap-1">
          {walls.map((wall) => (
            <li key={wall.id}>
              <button
                type="button"
                data-object-wall={wall.id}
                aria-pressed={wall.id === selectedWallId}
                onClick={() => onSelectWall(wall.id)}
                className="cad-row"
              >
                <span>{wall.label}</span>
                <span className="mw-num text-graphiteMw">{wall.id}</span>
                <span className={`mw-num ml-auto ${wall.state === 'measured' ? '' : 'text-tape'}`}>
                  {wall.lengthMm === null ? 'не замерена' : `${wall.lengthMm}${wall.state === 'assumed' ? '*' : ''}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mw-label mb-1">Модули · {modulesOf}</p>
        {modules.length === 0 ? (
          <p className="text-[13px] leading-snug text-graphiteMw">
            Мебели на этой стене нет. Инструмент «Мебель» — нажмите на пустое место стены и поставьте модуль.
          </p>
        ) : (
          <ul className="grid gap-1">
            {modules.map((unit) => (
              <li key={unit.id}>
                <button
                  type="button"
                  data-object-module={unit.id}
                  aria-pressed={unit.id === selectedModuleId}
                  onClick={() => onSelectModule(unit.id)}
                  className="cad-row"
                >
                  <span className="truncate">{unit.label}</span>
                  <span className="mw-num ml-auto text-graphiteMw">
                    {unit.offsetMm}+{unit.widthMm}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
