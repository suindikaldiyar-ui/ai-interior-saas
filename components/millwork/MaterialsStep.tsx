'use client';

import { useMemo, useRef, useState } from 'react';
import { compressPhoto } from '@/lib/photo';
import { formatMoney } from '@/lib/millwork/estimate';
import {
  APRON_TARGET,
  COUNTERTOP_TARGET,
  useInteriorStore,
} from '@/store/useInteriorStore';
import type { CatalogEntryFull } from '@/types/catalog';
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

  /*
   * ТРИ ПОВЕРХНОСТИ, А НЕ ОДИН СПИСОК.
   *
   * Фасады, столешница и фартук выбираются одновременно и стоят в смете
   * тремя разными строками. Одним списком с одним выбором клиент видел
   * своей только одну поверхность, а две остальные модель придумывала.
   *
   * Столешницу и фартук ищем по ключу сметы: именно он связывает товар
   * каталога со строкой расчёта.
   */
  const estimateKey = (entry: CatalogEntryFull) =>
    String(entry.meta?.estimateKey ?? '').trim();

  const facades = useMemo(
    () => catalog.filter((e) => e.category.applies_to === 'zone'),
    [catalog],
  );

  const countertops = useMemo(
    () =>
      catalog.filter((e) => {
        const key = estimateKey(e);
        // Запил и плинтус — работы, а не поверхность: выбирать их нечего.
        return (
          key.startsWith('countertop_') &&
          key !== 'countertop_miter' &&
          key !== 'countertop_plinth'
        );
      }),
    [catalog],
  );

  const aprons = useMemo(
    () => catalog.filter((e) => estimateKey(e) === 'wall_panel'),
    [catalog],
  );

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
        <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
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
            <div className="flex aspect-[3/2] w-full items-center justify-center rounded-[var(--r-control)] border border-dashed border-navyLine px-6 text-center text-[15px] leading-snug text-tape">
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
            <p className="text-[15px] font-medium">Снимать как на фото</p>
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

      {/* ── Материалы: три поверхности, три выбора ── */}
      <section className="mw-panel">
        <h3 className="text-[17px] font-medium">Материалы из каталога</h3>
        <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
          Фасады, столешница и фартук — три разные поверхности. Каждая уходит
          в рендер своим артикулом; невыбранная не мешает остальным.
        </p>

        <Surface
          title="Фасады кухни"
          items={facades}
          target={kitchenItemId}
          selections={selections}
          onSelect={setSelection}
          missing="В каталоге нет ни одной кухни"
          waiting="Фасады пойдут по описанию комплектации"
        />

        <Surface
          title="Столешница"
          items={countertops}
          target={COUNTERTOP_TARGET}
          selections={selections}
          onSelect={setSelection}
          missing="В каталоге нет столешниц"
          waiting="Столешница пойдёт по описанию комплектации"
        />

        <Surface
          title="Фартук"
          items={aprons}
          target={APRON_TARGET}
          selections={selections}
          onSelect={setSelection}
          missing="В каталоге нет стеновых панелей"
          waiting="Фартук пойдёт по описанию комплектации"
        />

        {facades.length + countertops.length + aprons.length === 0 && (
          <a href="/admin/catalog" className="mw-btn mw-btn-ghost mt-4">
            Завести товары в каталоге
          </a>
        )}
      </section>
    </div>
  );
}

/**
 * Одна поверхность: заголовок, список артикулов и строка состояния.
 *
 * Состояние пишется по каждой поверхности отдельно — «фартук пойдёт по
 * описанию» ничего не говорит о фасадах, и наоборот.
 */
function Surface({
  title,
  items,
  target,
  selections,
  onSelect,
  missing,
  waiting,
}: {
  title: string;
  items: CatalogEntryFull[];
  /** Куда пишется выбор. Для фасадов это объект сцены, и до неё он null. */
  target: string | null;
  selections: Record<string, string>;
  onSelect: (target: string, itemId: string | null) => void;
  missing: string;
  waiting: string;
}) {
  const selectedId = target ? selections[target] : undefined;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="mt-5">
      <p className="text-[15px] font-medium">{title}</p>

      {items.length === 0 ? (
        <p className="mt-2 text-[13px] leading-snug text-tape">
          {missing} — {waiting.toLowerCase()}.
        </p>
      ) : (
        <>
          <div className="mt-2 grid gap-2">
            {items.map((item) => {
              const active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => target && onSelect(target, active ? null : item.id)}
                  aria-pressed={active}
                  disabled={!target}
                  className={`mw-touch flex items-center gap-3 rounded-[var(--r-control)] px-4 text-left disabled:opacity-40 ${
                    active ? 'bg-cyanBright text-navyDeep' : 'bg-sheet hover:bg-navyLine/40'
                  }`}
                >
                  <span className="text-[15px]">{item.name_ru}</span>
                  <span className="mw-num ml-auto text-[13px] opacity-80">
                    {item.article}
                    {item.price > 0 ? ` · ${formatMoney(item.price)} ₸` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-[13px] leading-snug">
            {selected ? (
              <span className="text-graphiteMw">
                Выбрано: {selected.name_ru} · {selected.article}
              </span>
            ) : (
              <span className="text-tape">{waiting}.</span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
