'use client';

import { useState } from 'react';
import ElevationDrawing from './ElevationDrawing';
import PlanDrawing from './PlanDrawing';
import type { CommPoint, LayoutIssue, Run } from '@/types/millwork';

/**
 * РАБОЧАЯ СХЕМА: ВЕКТОР ВМЕСТО СЦЕНЫ.
 *
 * Клиент выбирает глазами, но для этого не нужен WebGL: вид спереди и план
 * рассказывают о мебели всё, что решается на встрече, — состав, ширины,
 * что за фасадом и из чего он сделан. Три.js из интерфейса убран целиком;
 * сцена осталась ровно для одного — снять clay-кадр для визуализации, и
 * живёт она за экраном.
 *
 * Рисуется ТЕМ ЖЕ кодом, что чертёжный лист: `ElevationDrawing` и
 * `PlanDrawing`. Второй отрисовки не существует намеренно — она разошлась
 * бы с листом на первой же правке, и клиент выбрал бы по схеме одно, а
 * подписал другое.
 *
 * Отличие от листа ровно одно: `showMaterial`. На бумаге заливка идёт по
 * ТИПУ элемента и печатается чёрно-белой (слой 26), здесь — по материалу:
 * человек должен видеть, что перед ним дуб, а не абстрактная панель.
 */

type Props = {
  run: Run;
  comms: CommPoint[];
  /** Расхождения с коммуникациями: те же знаки, что на листе. */
  issues?: LayoutIssue[];
  selectedModuleId: string | null;
  onSelect: (moduleId: string) => void;
  /**
   * Соседняя стена угла: рисуется КОНТУРОМ, без материала и без правки.
   *
   * Работа идёт по одной стене, но угол — это две: не видя соседнюю,
   * человек не понимает, где именно угол и куда упирается ряд. Контур
   * отвечает на это и не спорит с активным рядом за внимание.
   */
  neighbour?: Run | null;
  neighbourLabel?: string;
  /** Свободная сборка: модуль тянется вдоль ряда. */
  onMoveModule?: (moduleId: string, offsetMm: number) => void;
  changedIds?: string[];
};

type View = 'front' | 'plan';

export default function RunSchematic({
  run,
  comms,
  issues = [],
  neighbour = null,
  neighbourLabel,
  selectedModuleId,
  onSelect,
  onMoveModule,
  changedIds,
}: Props) {
  const [view, setView] = useState<View>('front');

  return (
    <div className="flex h-full flex-col" data-schematic data-schematic-view={view}>
      <div className="mb-2 flex gap-1">
        {(
          [
            ['front', 'Спереди'],
            ['plan', 'Сверху'],
          ] as const
        ).map(([key, title]) => (
          <button
            key={key}
            type="button"
            data-schematic-tab={key}
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={`mw-btn ${view === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {title}
          </button>
        ))}
      </div>

      {/*
        * Схема занимает всё оставшееся место и вписывается в него целиком:
        * прокручивать мебель на встрече нельзя, клиент теряет предмет
        * разговора. `min-h-0` обязателен — без него флекс-элемент не даёт
        * себя сжать, и низ схемы уезжает под панель.
        */}
      {/*
        * Соседняя стена — над активной, вполовину меньше и приглушённо:
        * это справка «вот где угол», а не второй предмет работы.
        */}
      {neighbour && neighbour.modules.length > 0 && (
        <div className="mb-2 rounded-[var(--r-panel)] bg-sheet/60 p-2" data-neighbour>
          <p className="mw-label mb-1">{neighbourLabel ?? 'Соседняя стена'} — в углу</p>
          <div className="h-[84px] [&>svg]:h-full [&>svg]:w-full">
            <ElevationDrawing run={neighbour} compact />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--r-panel)] bg-sheet p-2">
        <div className="mw-schematic h-full [&>svg]:h-full [&>svg]:w-full">
          {view === 'front' ? (
            <ElevationDrawing
              run={run}
              selectedModuleId={selectedModuleId}
              onSelect={onSelect}
              onMoveModule={onMoveModule}
              changedIds={changedIds}
              showMaterial
            />
          ) : (
            <PlanDrawing
              run={run}
              comms={comms}
              issues={issues}
              selectedModuleId={selectedModuleId}
              onSelect={onSelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}
