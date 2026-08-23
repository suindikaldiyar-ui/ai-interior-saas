'use client';

import { useRef, useState } from 'react';
import { compressPhoto, type RoomPhoto } from '@/lib/photo';

/**
 * Фотография стены, где встанет гарнитур.
 *
 * Шаг обязательный: без снимка рендер строится по пустой 3D-коробке из
 * замера — у неё нет ни окон клиента, ни его стен, и модель рисует свои.
 * Клиент не узнаёт квартиру, а узнавание и есть половина продажи.
 */

type Props = {
  photos: RoomPhoto[];
  primaryId: string | null;
  onChange: (photos: RoomPhoto[], primaryId: string | null) => void;
  onSubmit: () => void;
  submitLabel?: string;
};

export default function PhotoStep({
  photos,
  primaryId,
  onChange,
  onSubmit,
  submitLabel = 'Дальше',
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    try {
      const added: RoomPhoto[] = [];
      for (const file of Array.from(files)) {
        added.push(await compressPhoto(file));
      }
      const next = [...photos, ...added];
      onChange(next, primaryId ?? next[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Снимок не прочитался.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    const next = photos.filter((p) => p.id !== id);
    onChange(next, primaryId === id ? (next[0]?.id ?? null) : primaryId);
  };

  return (
    <main className="mw-root flex min-h-screen items-start justify-center px-4 py-8">
      <div className="w-full max-w-2xl border border-navyLine bg-sheet p-4">
        <p className="mw-label mb-1">Шаг 3 из 3</p>
        <h1 className="mw-title mb-1">
          Фото стены, где будет гарнитур
        </h1>
        <p className="mb-4 text-[13px] leading-snug text-graphiteMw">
          Снимите стену целиком, от угла до угла, вместе с окном и дверью.
          Именно этот кадр станет основой визуализации: клиент должен увидеть
          свою квартиру, а не похожую. Снимок сжимается до 1600 px прямо здесь.
        </p>

        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          {photos.map((photo) => {
            const primary = photo.id === primaryId;
            return (
              <figure
                key={photo.id}
                className={`border ${primary ? 'border-cyanBright' : 'border-navyLine'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.dataUrl} alt={photo.name} className="aspect-[4/3] w-full object-cover" />
                <figcaption className="flex items-center gap-1 px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => onChange(photos, photo.id)}
                    className={`text-[13px] ${
                      primary ? 'text-cyanBright' : 'text-graphiteMw underline'
                    }`}
                  >
                    {primary ? 'Главное' : 'Сделать главным'}
                  </button>
                  <span className="mw-num ml-auto text-[13px] text-graphiteMw">
                    {photo.sizeKb} КБ
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(photo.id)}
                    className="text-[13px] text-alert"
                    aria-label="Удалить снимок"
                  >
                    ×
                  </button>
                </figcaption>
              </figure>
            );
          })}

          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex aspect-[4/3] items-center justify-center border border-dashed border-navyLine text-[13px] text-graphiteMw hover:border-cyan hover:text-textMw disabled:opacity-40"
          >
            {busy ? 'Сжимаем…' : '+ Добавить фото'}
          </button>
        </div>

        {error && <p className="mb-2 text-[13px] text-alert">{error}</p>}

        {photos.length === 0 && (
          <p className="mb-3 text-[13px] text-tape">
            Без фото помещения клиент увидит настроение, а не свою квартиру.
          </p>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={photos.length === 0 || busy}
          className="mw-btn mw-btn-lg mw-btn-primary w-full"
        >
          {submitLabel}
        </button>

        {photos.length === 0 && (
          <button
            type="button"
            onClick={onSubmit}
            className="mt-2 w-full text-[13px] text-graphiteMw underline"
          >
            Продолжить без фото — рендер будет по описанию
          </button>
        )}
      </div>
    </main>
  );
}
