'use client';

import { useMemo, useRef, useState } from 'react';
import { compressPhoto } from '@/lib/photo';
import { formatMoney } from '@/lib/millwork/estimate';
import { useInteriorStore } from '@/store/useInteriorStore';
import { RUN_ANGLE_LABEL, type RunAngle } from '@/types/render';

/**
 * Материалы и основа кадра — один шаг.
 *
 * И артикул каталога, и фотография помещения нужны ровно для одного:
 * чтобы клиент увидел на рендере свою квартиру и свой товар. Раньше они
 * лежали в панели рендера и терялись за кнопкой отрисовки.
 */

type Props = {
  kitchenItemId: string | null;
  roomPhoto: string | null;
  onPhotoChange: (dataUrl: string | null) => void;
  angle: RunAngle;
  onAngleChange: (angle: RunAngle) => void;
  onOpenPhoto?: (dataUrl: string) => void;
};

const ANGLES: RunAngle[] = ['front', 'left', 'right'];

export default function MaterialsStep({
  kitchenItemId,
  roomPhoto,
  onPhotoChange,
  angle,
  onAngleChange,
  onOpenPhoto,
}: Props) {
  const photoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog = useInteriorStore((s) => s.catalog);
  const selections = useInteriorStore((s) => s.selections);
  const setSelection = useInteriorStore((s) => s.setSelection);

  const kitchens = useMemo(
    () => catalog.filter((e) => e.category.applies_to === 'zone'),
    [catalog],
  );

  const selectedId = kitchenItemId ? selections[kitchenItemId] : undefined;
  const selected = kitchens.find((k) => k.id === selectedId) ?? null;

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await compressPhoto(file);
      onPhotoChange(photo.dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Снимок не прочитался.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void addPhoto(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* ── Фотография помещения ── */}
      <section className="mw-panel">
        <h3 className="text-[17px] font-medium">Фото помещения</h3>
        <p className="mt-1 text-[14px] leading-snug text-graphiteMw">
          С него берутся окна, двери и ракурс. Из сцены — только гарнитур.
        </p>

        <div className="mt-4">
          {roomPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={roomPhoto}
              alt="Помещение клиента"
              onClick={() => onOpenPhoto?.(roomPhoto)}
              className="aspect-[3/2] w-full cursor-zoom-in rounded-[var(--r-control)] object-cover"
            />
          ) : (
            <div className="flex aspect-[3/2] w-full items-center justify-center rounded-[var(--r-control)] border border-dashed border-navyLine px-6 text-center text-[14px] leading-snug text-tape">
              Без фото клиент увидит настроение, а не свою квартиру
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            disabled={busy}
            className="mw-btn mw-btn-ghost"
          >
            {busy ? 'Сжимаем…' : roomPhoto ? 'Заменить фото' : 'Добавить фото'}
          </button>
          {roomPhoto && (
            <button
              type="button"
              onClick={() => onPhotoChange(null)}
              className="mw-btn mw-btn-ghost"
            >
              Убрать
            </button>
          )}
        </div>

        {error && <p className="mt-2 text-[13px] text-alert">{error}</p>}

        {roomPhoto && (
          <div className="mt-5">
            <p className="text-[14px] font-medium">Снимать как на фото</p>
            <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
              Кадр гарнитура снимется с той же стороны, с какой сделано фото.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ANGLES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => onAngleChange(a)}
                  aria-pressed={angle === a}
                  className={`mw-btn ${angle === a ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  {RUN_ANGLE_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Артикул каталога ── */}
      <section className="mw-panel">
        <h3 className="text-[17px] font-medium">Материалы из каталога</h3>
        <p className="mt-1 text-[14px] leading-snug text-graphiteMw">
          Артикул кухни даёт в рендер фасады, столешницу и фартук — именно ваши.
        </p>

        {kitchens.length === 0 ? (
          <p className="mt-4 text-[14px] leading-snug text-tape">
            В каталоге нет ни одной кухни. Заведите товар с областью применения
            «зона» —{' '}
            <a href="/admin/catalog" className="text-cyanBright underline">
              перейти в каталог
            </a>
            .
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-2">
              {kitchens.map((k) => {
                const active = k.id === selectedId;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => kitchenItemId && setSelection(kitchenItemId, active ? null : k.id)}
                    aria-pressed={active}
                    className={`mw-touch flex items-center gap-3 rounded-[var(--r-control)] px-4 text-left ${
                      active ? 'bg-cyanBright text-navyDeep' : 'bg-sheet hover:bg-navyLine/40'
                    }`}
                  >
                    <span className="text-[15px]">{k.name_ru}</span>
                    <span className="mw-num ml-auto text-[13px] opacity-80">
                      {k.article}
                      {k.price > 0 ? ` · ${formatMoney(k.price)} ₸` : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            {!selected && (
              <p className="mt-3 text-[13px] leading-snug text-tape">
                Артикул не выбран — рендер пойдёт по описанию комплектации.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
