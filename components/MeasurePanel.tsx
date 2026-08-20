'use client';

import { useRef, useState } from 'react';
import { describeDoors, roomFromAnalysis } from '@/lib/roomFromAnalysis';
import { useInteriorStore } from '@/store/useInteriorStore';
import {
  CONFIDENCE_THRESHOLD,
  needsConfirmation,
  type AnalyzeRoomResponse,
} from '@/types/roomAnalysis';

const fieldCls =
  'tnum w-full border border-lineStrong bg-white px-2 py-1.5 font-mono text-[12px] outline-none';

export default function MeasurePanel() {
  const analysis = useInteriorStore((s) => s.analysis);
  const setAnalysis = useInteriorStore((s) => s.setAnalysis);
  const measurements = useInteriorStore((s) => s.measurements);
  const setMeasurements = useInteriorStore((s) => s.setMeasurements);
  const room = useInteriorStore((s) => s.room);
  const setRoom = useInteriorStore((s) => s.setRoom);

  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    setPhoto(dataUrl);
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/analyze-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: dataUrl }),
      });
      const data = (await res.json()) as AnalyzeRoomResponse;
      if (data.analysis) setAnalysis(data.analysis);
      else setError(data.error ?? 'Не удалось разобрать фотографию.');
    } catch {
      setError('Сервер не ответил.');
    } finally {
      setBusy(false);
    }
  };

  const applyToScene = () => {
    if (!analysis) return;
    const built = roomFromAnalysis(analysis, measurements, room);
    setRoom(built.room);
    setAssumptions(built.assumptions);
  };

  const blocked = analysis ? needsConfirmation(analysis) && !measurements.confirmed : false;

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPhoto} />

      <p className="micro-label mb-1.5">Фотография черновой отделки</p>
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        className="w-full border border-lineStrong bg-paper px-2 py-2 text-[11px] uppercase tracking-[0.1em] hover:border-graphite disabled:opacity-40"
      >
        {busy ? 'Читаем фото…' : photo ? 'Заменить фото' : 'Загрузить фото'}
      </button>

      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt="Фото помещения"
          className="mt-2 w-full border border-lineStrong object-cover"
        />
      )}

      {error && <p className="mt-2 text-[11px] text-ochre">{error}</p>}

      {analysis && (
        <>
          <div className="mt-3 border border-lineStrong bg-paperAlt p-2">
            <div className="flex items-baseline justify-between">
              <span className="micro-label">Что увидела модель</span>
              <span
                className={`tnum font-mono text-[11px] ${
                  analysis.confidence < CONFIDENCE_THRESHOLD ? 'text-ochre' : 'text-patina'
                }`}
              >
                уверенность {(analysis.confidence * 100).toFixed(0)}%
              </span>
            </div>

            <dl className="mt-1.5 space-y-0.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-graphiteSoft">Форма</dt>
                <dd>{analysis.shape}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-graphiteSoft">Пропорция</dt>
                <dd className="tnum font-mono">
                  {analysis.estimatedRatio.width.toFixed(2)} :{' '}
                  {analysis.estimatedRatio.depth.toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-graphiteSoft">Потолок</dt>
                <dd>{analysis.ceilingHint}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-graphiteSoft">Окон</dt>
                <dd className="tnum font-mono">{analysis.windows.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-graphiteSoft">Двери</dt>
                <dd className="text-right">{describeDoors(analysis)}</dd>
              </div>
            </dl>

            {analysis.features.length > 0 && (
              <p className="mt-1.5 text-[10px] text-graphiteSoft">
                Особенности: {analysis.features.join('; ')}
              </p>
            )}

            <p className="mt-2 border-t border-lineStrong pt-1.5 text-[10px] leading-snug text-graphiteSoft">
              Модель не измеряет, а описывает. Пропорции берутся с фото,
              абсолютные размеры — только с замера.
            </p>
          </div>

          {analysis.warnings.length > 0 && (
            <ul className="mt-2 border border-ochre bg-paperAlt p-2">
              {analysis.warnings.map((w, i) => (
                <li key={i} className="text-[11px] text-ochre">
                  ⚠ {w}
                </li>
              ))}
            </ul>
          )}

          {analysis.shape !== 'rectangular' && (
            <p className="mt-2 border border-ochre p-2 text-[11px] leading-snug text-ochre">
              Планировка не прямоугольная ({analysis.shape}). Текущая версия строит
              только прямоугольные помещения — постройте прямоугольную вручную и
              учтите выступы отдельно.
            </p>
          )}

          {analysis.needsMeasurement.length > 0 && (
            <p className="mt-2 text-[11px] text-graphiteSoft">
              Нужен замер: {analysis.needsMeasurement.join(', ')}.
            </p>
          )}
        </>
      )}

      <p className="micro-label mb-1.5 mt-4">Замер · абсолютные размеры</p>
      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className="micro-label">Ширина, м</span>
          <input
            type="number"
            step={0.05}
            value={measurements.width ?? ''}
            onChange={(e) =>
              setMeasurements({
                width: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className={fieldCls}
          />
        </label>
        <label>
          <span className="micro-label">Глубина, м</span>
          <input
            type="number"
            step={0.05}
            value={measurements.depth ?? ''}
            onChange={(e) =>
              setMeasurements({
                depth: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className={fieldCls}
          />
        </label>
        <label>
          <span className="micro-label">Высота, м</span>
          <input
            type="number"
            step={0.05}
            value={measurements.height ?? ''}
            onChange={(e) =>
              setMeasurements({
                height: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className={fieldCls}
          />
        </label>
      </div>

      {blocked && (
        <label className="mt-2 flex items-start gap-2 border border-ochre p-2">
          <input
            type="checkbox"
            checked={Boolean(measurements.confirmed)}
            onChange={(e) => setMeasurements({ confirmed: e.target.checked })}
            className="mt-0.5"
          />
          <span className="text-[11px] leading-snug text-ochre">
            Модель прочитала помещение неуверенно. Подтвердите, что проверили
            размеры и состав вручную.
          </span>
        </label>
      )}

      <button
        type="button"
        onClick={applyToScene}
        disabled={!analysis || blocked}
        className="mt-3 w-full border border-patina bg-patina px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-paper disabled:cursor-not-allowed disabled:opacity-40"
      >
        Построить комнату
      </button>

      {assumptions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {assumptions.map((a, i) => (
            <li key={i} className="text-[10px] leading-snug text-graphiteSoft">
              · {a}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
