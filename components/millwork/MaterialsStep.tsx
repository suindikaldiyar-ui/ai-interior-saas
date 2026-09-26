'use client';

import { useMemo, useRef, useState } from 'react';
import { compressPhoto } from '@/lib/photo';
import { formatMoney } from '@/lib/millwork/estimate';
import {
  APRON_TARGET,
  FACADE_TARGET,
  useInteriorStore,
} from '@/store/useInteriorStore';
import { zoneProfile } from '@/lib/millwork/zones';
import type { CatalogEntryFull } from '@/types/catalog';
import type { ZoneKind } from '@/types/millwork';
import { RUN_ANGLE_LABEL, type RunAngle } from '@/types/render';

/**
 * Материалы и основа кадра — один шаг.
 *
 * И артикул каталога, и фотография помещения нужны ровно для одного:
 * чтобы клиент увидел на рендере свою квартиру и свой товар. Раньше они
 * лежали в панели рендера и терялись за кнопкой отрисовки.
 */

type Props = {
  /** Зона объекта: в спальне столешницы и фартука не существует. */
  zone?: ZoneKind;
  kitchenItemId: string | null;
  roomPhoto: string | null;
  onPhotoChange: (dataUrl: string | null) => void;
  angle: RunAngle;
  onAngleChange: (angle: RunAngle) => void;
};

const ANGLES: RunAngle[] = ['front', 'left', 'right'];

export default function MaterialsStep({
  zone = 'kitchen',
  kitchenItemId,
  roomPhoto,
  onPhotoChange,
  angle,
  onAngleChange,
}: Props) {
  const photoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = zoneProfile(zone);
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

  const aprons = useMemo(
    () => catalog.filter((e) => estimateKey(e) === 'wall_panel'),
    [catalog],
  );

  /*
   * Фасады пишутся под собственный ключ, а не под id объекта сцены: на этом
   * шаге сцены ещё нет, id нет, и выбор молча уходил в никуда.
   *
   * `kitchenItemId` остаётся ради объектов, собранных до этой правки: там
   * товар лежит под id гарнитура. Читаем оба ключа, пишем в новый.
   */
  /** Сколько блоков на экране: в спальне остаётся один — фасады. */
  const surfaces = 1 + (profile.hasApron ? 1 : 0);
  /** Есть ли вообще что выбирать в этой зоне. */
  const available = facades.length + (profile.hasApron ? aprons.length : 0);

  const legacyId = kitchenItemId ? selections[kitchenItemId] : undefined;
  const facadeId = selections[FACADE_TARGET] ?? legacyId;

  const selectFacade = (id: string | null) => {
    setSelection(FACADE_TARGET, id);
    // Старый ключ снимаем, иначе в промпт уедут два разных артикула фасадов.
    if (kitchenItemId && selections[kitchenItemId]) setSelection(kitchenItemId, null);
  };

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
          С него берутся окна, двери и ракурс. Из схемы — только гарнитур.
        </p>

        {/*
          * ПРЕВЬЮ ЗДЕСЬ НЕТ: снимок живёт ПЕРВЫМ блоком панели.
          *
          * Он обязательный шаг продажи, и внизу его искали прокруткой при
          * клиенте — значит не делали вовсе. Второй превью того же фото в
          * той же панели читается как второе фото.
          */}

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
          {surfaces === 1
            ? 'Артикул уходит в рендер: клиент увидит свой фасад, а не похожий.'
            : 'Каждая поверхность уходит в рендер своим артикулом; невыбранная не мешает остальным.'}
        </p>

        <Surface
          title={profile.facadeTitle}
          items={facades}
          selectedId={facadeId}
          onSelect={selectFacade}
          missing="В каталоге нет подходящих артикулов"
          waiting="Фасады пойдут по описанию комплектации"
        />

        {/*
          * СТОЛЕШНИЦУ ВЫБИРАЮТ В ОДНОМ МЕСТЕ — В ПАНЕЛИ «МАТЕРИАЛЫ» (слой 52).
          *
          * Здесь был второй выбор: он писал `selections['zone:countertop']`,
          * не сохранялся с объектом и в смету не шёл, а смета считала
          * столешницу ряда (`set_countertop`). Две кнопки одной вещи
          * показывали клиенту две разные столешницы.
          *
          * Столешницы и фартука в спальне и прихожей не существует — и в
          * смете, и на чертеже их уже нет.
          */}
        {profile.hasCountertop && (
          <div className="mt-5" data-countertop-moved>
            <p className="text-[15px] font-medium">Столешница</p>
            <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
              Выбирается в панели «Материалы» (цель «Столешница»): там она ложится на ряд
              и идёт в смету, чертёж и рендер.
            </p>
          </div>
        )}

        {profile.hasApron && (
          <Surface
            title="Фартук"
            items={aprons}
            selectedId={selections[APRON_TARGET]}
            onSelect={(id) => setSelection(APRON_TARGET, id)}
            missing="В каталоге нет стеновых панелей"
            waiting="Фартук пойдёт по описанию комплектации"
          />
        )}

        {available === 0 && (
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
  selectedId,
  onSelect,
  missing,
  waiting,
}: {
  title: string;
  items: CatalogEntryFull[];
  /** Что выбрано сейчас. Ключ хранения — забота вызывающего. */
  selectedId: string | undefined;
  onSelect: (itemId: string | null) => void;
  missing: string;
  waiting: string;
}) {
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
                  onClick={() => onSelect(active ? null : item.id)}
                  aria-pressed={active}
                  className={`mw-touch flex items-center gap-3 rounded-[var(--r-control)] px-4 text-left ${
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
