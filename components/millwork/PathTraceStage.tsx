'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import type { ProductionSettings } from '@/types/catalog';
import type { SceneView } from '@/lib/cameraFraming';
import type { RoomSource } from '@/lib/millwork/room';
import type { SceneRow } from './cabinet3d/CadScene';
import type { PathTraceSource } from './cabinet3d/pathTrace';
import { pathTraceCounters } from './cabinet3d/pathTraceStatus';

/*
 * Сцена — только `dynamic(ssr:false)`: WebGL на сервере нет, а статический
 * импорт затащил бы three.js в бандл рабочего места (ловушка 41).
 */
const CadScene = dynamic(() => import('./cabinet3d/CadScene'), { ssr: false });

type Props = {
  rows: SceneRow[];
  room?: RoomSource;
  production?: ProductionSettings;
  roomWidthM: number;
  roomDepthM: number;
  facadeColor?: string;
  /** Ракурс — последний, что был в 3D на шаге конфигуратора. */
  view: SceneView;
  onRenderSource: (source: (() => PathTraceSource) | null) => void;
};

/**
 * СЦЕНА ДЛЯ РЕНДЕРА С ШАГА «РЕЗУЛЬТАТ» — ТА ЖЕ `CadScene` (слой 54).
 *
 * На «Результате» 3D на экране нет, а рендер обязан снимать ТУ ЖЕ сцену,
 * что САПР-вид: второй сборки мебели для картинки нет. Поэтому на время
 * рендера сцена монтируется за экраном — теми же рядами, той же комнатой,
 * тем же ракурсом — и снимается сразу после: свой контекст WebGL она
 * отдаёт вместе с собой.
 *
 * Холст 1280×720 — пропорция картинки: кадр «Общего вида» считается от
 * холста (`generalCamera`), и в 16:9 он встаёт так же, как встанет на
 * картинке. Камера ставится сразу, без перелёта: смотреть на него некому.
 */
export default function PathTraceStage({
  rows,
  room,
  production,
  roomWidthM,
  roomDepthM,
  facadeColor,
  view,
  onRenderSource,
}: Props) {
  useEffect(() => {
    const counters = pathTraceCounters();
    counters.stages += 1;
    return () => {
      counters.stages -= 1;
    };
  }, []);

  return (
    <div
      aria-hidden
      data-pathtrace-stage
      className="mw-scene-hidden pointer-events-none fixed left-[-4000px] top-0"
      style={{ width: 1280, height: 720 }}
    >
      <CadScene
        rows={rows}
        room={room}
        production={production}
        roomWidthM={roomWidthM}
        roomDepthM={roomDepthM}
        facadeColor={facadeColor}
        view={view}
        orbit={false}
        instantCamera
        selectedModuleId={null}
        onSelectModule={() => undefined}
        onRenderSource={onRenderSource}
      />
    </div>
  );
}
