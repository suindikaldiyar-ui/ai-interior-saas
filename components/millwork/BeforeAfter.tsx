'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * «До и после»: фотография помещения против рендера.
 *
 * Это главное доказательство, что планировка не поехала: клиент видит своё
 * окно, свою дверь и свои стены — и на них стоит его кухня. Техническая
 * 3D-сцена здесь не нужна вовсе, она нужна только для захвата кадра.
 *
 * ПРОИЗВОДИТЕЛЬНОСТЬ. Во время перетаскивания React не трогается вовсе:
 * позиция живёт в `ref` и пишется прямо в CSS-переменную `--split`, не чаще
 * одного кадра. Слушатель `pointermove` навешивается на САМ блок только
 * между `pointerdown` и `pointerup` — не на window и не навсегда. В состояние
 * позиция попадает один раз, на отпускании.
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

const START_POS = 50;

export default function BeforeAfter({
  photo,
  render,
  title,
  onAddPhoto,
  emptyHint = 'Нажмите «Отрисовать три комплектации»',
  onOpen,
}: Props) {
  /*
   * Счётчик рендеров для `scripts/check-repaint.mjs`: включается только
   * флагом из скрипта, в обычной работе это одно чтение свойства. Мерить
   * перерисовки иначе нечем — а именно они здесь и были проблемой.
   */
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __baCount?: boolean; __baRenders?: number };
    if (w.__baCount) w.__baRenders = (w.__baRenders ?? 0) + 1;
  }

  /** Значение для React: подпись, aria и стартовая раскладка. */
  const [pos, setPos] = useState(START_POS);

  const frame = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  /** Живая позиция во время перетаскивания — без перерисовки дерева. */
  const live = useRef(START_POS);
  const raf = useRef<number | null>(null);
  /** Снятие слушателей текущего перетаскивания. */
  const stopDrag = useRef<(() => void) | null>(null);

  /** Пишем позицию в DOM напрямую: CSS-переменная и aria на ручке. */
  const paint = useCallback((value: number) => {
    live.current = value;
    frame.current?.style.setProperty('--split', `${value}%`);
    handle.current?.setAttribute('aria-valuenow', String(Math.round(value)));
  }, []);

  const fromClientX = useCallback(
    (clientX: number) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const next = ((clientX - box.left) / box.width) * 100;
      paint(Math.min(100, Math.max(0, next)));
    },
    [paint],
  );

  // Незакрытое перетаскивание не должно пережить размонтирование.
  useEffect(() => () => stopDrag.current?.(), []);

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = frame.current;
    if (!el) return;

    stopDrag.current?.();
    fromClientX(event.clientX);

    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* эмулированный указатель захват не поддерживает */
    }

    const onMove = (e: PointerEvent) => {
      // Не чаще кадра: между кадрами всё равно ничего не видно.
      const x = e.clientX;
      if (raf.current !== null) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        fromClientX(x);
      });
    };

    const onEnd = () => {
      stopDrag.current?.();
      // Единственный setState за всё перетаскивание.
      setPos(live.current);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);

    stopDrag.current = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      stopDrag.current = null;
    };
  };

  const nudge = (delta: number) => {
    const next = Math.min(100, Math.max(0, live.current + delta));
    paint(next);
    setPos(next);
  };

  if (!photo) {
    return (
      <div className="mw-panel-flat flex w-full max-w-3xl flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-[15px] leading-snug text-graphiteMw">
          Без фотографии помещения клиент увидит настроение, а не свою квартиру.
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
    <figure className="m-0 w-full max-w-3xl lg:max-w-[560px]">
      <div
        ref={frame}
        style={{ '--split': `${pos}%` } as React.CSSProperties}
        className="relative aspect-[3/2] w-full touch-none select-none overflow-hidden rounded-[var(--r-panel)] bg-navyDeep"
        onPointerDown={beginDrag}
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
          style={{ clipPath: 'inset(0 0 0 var(--split))' }}
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
              <span className="text-[13px] leading-snug text-graphiteMw">{emptyHint}</span>
            </div>
          )}
        </div>

        {/* Шторка */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-cyanBright"
          style={{ left: 'var(--split)' }}
        />
        <div
          ref={handle}
          role="slider"
          aria-label="Сравнение до и после"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') nudge(-4);
            if (e.key === 'ArrowRight') nudge(4);
          }}
          className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-cyanBright text-navyDeep shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
          style={{ left: 'var(--split)' }}
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
