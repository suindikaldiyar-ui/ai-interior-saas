'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * «До и после»: фотография помещения против рендера.
 *
 * Это главное доказательство, что планировка не поехала: клиент видит своё
 * окно, свою дверь и свои стены — и на них стоит его кухня. Техническая
 * 3D-сцена здесь не нужна вовсе, она нужна только для захвата кадра.
 *
 * Шторка тянется пальцем: Pointer Events ловят и мышь, и касание одним
 * кодом, а `setPointerCapture` не теряет палец за краем картинки.
 */

type Props = {
  /** Фотография помещения клиента. Без неё сравнивать нечего. */
  photo: string | null;
  /** Выбранный вариант рендера. */
  render: string | null;
  /** Подпись правой половины: название комплектации. */
  title: string;
  /** Что сделать, если фотографии ещё нет. */
  onAddPhoto?: () => void;
  /** Что написать, если рендера ещё нет. */
  emptyHint?: string;
  onOpen?: (image: string) => void;
};

export default function BeforeAfter({
  photo,
  render,
  title,
  onAddPhoto,
  emptyHint = 'Нажмите «Отрисовать три комплектации»',
  onOpen,
}: Props) {
  const [pos, setPos] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  // Отдельный признак перетаскивания: полагаться на hasPointerCapture нельзя —
  // захват недоступен для эмулированных указателей и молча роняет обработчик.
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const next = ((clientX - box.left) / box.width) * 100;
    setPos(Math.min(100, Math.max(0, next)));
  }, []);

  if (!photo) {
    return (
      <div className="mw-panel-flat flex w-full max-w-3xl flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-[15px] leading-snug text-graphiteMw">
          Сравнить не с чем: фотографии помещения нет. С ней клиент увидит
          свою квартиру, а не похожую.
        </p>
        {onAddPhoto && (
          <button type="button" onClick={onAddPhoto} className="mw-btn mw-btn-primary">
            Добавить фото помещения
          </button>
        )}
      </div>
    );
  }

  return (
    /* Ширина ограничена: на планшете кадр 3:2 во всю ширину выдавливает
       карточки вариантов и кнопки за экран. */
    <figure className="m-0 w-full max-w-3xl lg:max-w-[560px]">
      <div
        ref={frame}
        className="relative aspect-[3/2] w-full touch-none select-none overflow-hidden rounded-[var(--r-panel)] bg-navyDeep"
        onPointerDown={(e) => {
          dragging.current = true;
          moveTo(e.clientX);
          // Захват держит палец за краем картинки; без него тоже работает.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* указатель уже отпущен или эмулирован */
          }
        }}
        onPointerMove={(e) => {
          if (dragging.current) moveTo(e.clientX);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* захвата и не было */
          }
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onPointerLeave={() => {
          dragging.current = false;
        }}
      >
        {/* До: помещение клиента */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt="Помещение клиента"
          draggable={false}
          onDoubleClick={() => onOpen?.(photo)}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* После: выбранная комплектация */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
          aria-hidden={!render}
        >
          {render ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={render}
              alt={title}
              draggable={false}
              onDoubleClick={() => onOpen?.(render)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-navyDeep/85 px-6 text-center">
              <span className="text-[14px] leading-snug text-graphiteMw">{emptyHint}</span>
            </div>
          )}
        </div>

        {/* Шторка */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-cyanBright"
          style={{ left: `${pos}%` }}
        />
        <div
          role="slider"
          aria-label="Сравнение до и после"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 4));
            if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 4));
          }}
          className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-cyanBright text-navyDeep shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
          style={{ left: `${pos}%` }}
        >
          <span aria-hidden className="text-[15px] leading-none">
            ⇄
          </span>
        </div>

        {/* Подписи половин */}
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-[var(--r-control)] bg-navyDeep/75 px-3 py-1 text-[13px]">
          Ваша квартира
        </span>
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-[var(--r-control)] bg-navyDeep/75 px-3 py-1 text-[13px]">
          {render ? title : 'Рендера ещё нет'}
        </span>
      </div>

      <figcaption className="mt-2 text-[13px] leading-snug text-graphiteMw">
        Тяните шторку: окна, двери и стены остаются на своих местах — меняется
        только отделка и гарнитур.
      </figcaption>
    </figure>
  );
}
