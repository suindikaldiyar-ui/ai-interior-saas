'use client';

import { useCallback, useRef, useState } from 'react';
import { SCENE_VIEW_LABEL, type SceneView } from '@/lib/cameraFraming';
import type { PathImage } from '@/lib/millwork/pathtrace';
import type { RoomSource } from '@/lib/millwork/room';
import type { ProductionSettings } from '@/types/catalog';
import type { SceneRow } from './cabinet3d/CadScene';
import type { PathTraceSource } from './cabinet3d/pathTrace';
import PathTracePanel from './PathTracePanel';
import PathTraceStage from './PathTraceStage';

type Props = {
  image: PathImage | null;
  onImage: (image: PathImage) => void;
  projectId?: string | null;
  /** Сохранённый рендер не прочитался — словами. */
  readError?: string | null;
  /** Сцена рендера: те же ряды, комната и ракурс, что в 3D. */
  rows: SceneRow[];
  room?: RoomSource;
  production?: ProductionSettings;
  roomWidthM: number;
  roomDepthM: number;
  facadeColor?: string;
  view: SceneView;
};

/**
 * РЕНДЕР ПО ЧЕРТЕЖУ НА ШАГЕ «РЕЗУЛЬТАТ» (слой 54).
 *
 * Картинка = то, что режет цех: та же мебель, материалы и комната по
 * замеру, свет посчитан лучами. Сравнение «до и после» выше — другое: там
 * кухня на фотографии квартиры, и её рисует модель.
 *
 * 3D на этом шаге на экране нет, поэтому на время рендера та же
 * `CadScene` монтируется за экраном (`PathTraceStage`) последним ракурсом
 * из 3D и снимается вместе со своим контекстом сразу после. Модуль
 * грузится по требованию: первая загрузка `/demo` от него не растёт.
 */
export default function PathTraceResult({
  image,
  onImage,
  projectId = null,
  readError = null,
  rows,
  room,
  production,
  roomWidthM,
  roomDepthM,
  facadeColor,
  view,
}: Props) {
  const [stage, setStage] = useState(false);
  const source = useRef<(() => PathTraceSource) | null>(null);
  const waiter = useRef<((got: (() => PathTraceSource) | null) => void) | null>(null);

  const onRenderSource = useCallback((got: (() => PathTraceSource) | null) => {
    source.current = got;
    const wait = waiter.current;
    if (got && wait) {
      waiter.current = null;
      wait(got);
    }
  }, []);

  const acquire = useCallback(async () => {
    setStage(true);
    const got =
      source.current ??
      (await new Promise<(() => PathTraceSource) | null>((resolve) => {
        waiter.current = resolve;
        window.setTimeout(() => {
          if (waiter.current !== resolve) return;
          waiter.current = null;
          resolve(null);
        }, 30_000);
      }));
    if (!got) throw new Error('сцена для рендера не поднялась за 30 с');
    // Два кадра: коробки мебели и камера встают в эффектах сцены.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return got();
  }, []);

  const release = useCallback(() => setStage(false), []);

  return (
    <section data-result-render className="mw-panel mt-5 print:hidden">
      <p className="mw-label mb-1">Кухня по чертежу</p>
      <p className="mb-3 text-[13px] leading-snug text-graphiteMw">
        Та же мебель, размеры и материалы, что на чертеже и в смете, в комнате по замеру; свет
        посчитан лучами, без ИИ. Снимается последний ракурс 3D — «{SCENE_VIEW_LABEL[view]}».
      </p>
      {readError && !image && (
        <p data-pathtrace-read-error className="mb-3 text-[13px] leading-snug text-tape">
          {readError}
        </p>
      )}
      <PathTracePanel acquire={acquire} release={release} image={image} onImage={onImage} projectId={projectId} />
      {stage && (
        <PathTraceStage
          rows={rows}
          room={room}
          production={production}
          roomWidthM={roomWidthM}
          roomDepthM={roomDepthM}
          facadeColor={facadeColor}
          view={view}
          onRenderSource={onRenderSource}
        />
      )}
    </section>
  );
}
