'use client';

import { useEffect, useRef } from 'react';

/**
 * ПОДТВЕРЖДЕНИЕ ПОТЕРИ ОТСЕКОВ (R02A.1).
 *
 * Замена модуля, вариант, секция и число фронтов ставят наполнение варианта
 * заново: перегородки, полки отсеков и блоки ящиков, собранные человеком,
 * уходят. Молча так делать нельзя (замерщик главнее алгоритма), поэтому
 * правка ждёт здесь: что пропадёт — словами (`opsBayLoss`), «Отмена» не
 * меняет ничего, «Снять отсеки и применить» — та же правка, подтверждённая
 * (`confirmBayLoss`).
 *
 * Фокус — на «Отмене»: случайный Enter не снимает чужую работу. Esc —
 * тоже отмена.
 */
export default function BayLossDialog({
  text,
  onConfirm,
  onCancel,
  title = 'Изменение снимет собранное в шкафу',
  confirmLabel = 'Снять отсеки и применить',
}: {
  text: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Заголовок: у правки зоны (R02B) он свой — снимается не отсек, а содержимое зоны. */
  title?: string;
  confirmLabel?: string;
}) {
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navyDeep/70 p-4 print:hidden" data-bay-loss-dialog>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bay-loss-title"
        aria-describedby="bay-loss-text"
        className="mw-panel w-full max-w-[520px] p-6"
      >
        <h2 id="bay-loss-title" className="text-[17px] font-medium">
          {title}
        </h2>
        <p id="bay-loss-text" className="mt-3 text-[15px] leading-snug" data-bay-loss-text>
          {text}
        </p>
        <p className="mt-2 text-[13px] leading-snug text-graphiteMw">
          «Отмена» ничего не меняет: шкаф останется таким, как сейчас.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancel} type="button" className="mw-btn mw-btn-ghost" data-bay-loss-action="cancel" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="mw-btn mw-btn-primary" data-bay-loss-action="confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
