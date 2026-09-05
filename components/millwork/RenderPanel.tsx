'use client';

import { useDebug } from '@/lib/debug';
import { DEMO_QUOTA_HINT, DEMO_QUOTA_SPENT } from '@/lib/plan';
import { RENDER_CHOICES } from '@/lib/millwork/render';
import { getStyle } from '@/lib/renderStyles';
import { formatMoney } from '@/lib/millwork/estimate';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { Variant } from '@/types/millwork';

/**
 * Кухня в квартире клиента.
 *
 * Комплектация одна: три бюджета усложняли разговор, клиент сравнивал
 * картинки вместо того, чтобы решать. Здесь только результат: выбор стиля,
 * одна кнопка, одна картинка и повтор.
 *
 * Само состояние отрисовки живёт выше (`useMillworkRender`): такая же кнопка
 * стоит в пустой половине сравнения, и обе обязаны показывать одно и то же.
 */

type Props = {
  variants: Variant[];
  onOpen?: (image: string) => void;
  /** Выбранный стиль и его смена. */
  styleId: string;
  onStyleChange: (id: string) => void;
  busy: boolean;
  error: string | null;
  onRender: () => void;
  onRerender: (variant: Variant) => void;
  /** Без фотографии рендер рисует чужие стены — говорим об этом прямо. */
  roomPhoto?: string | null;
  /**
   * Демонстрационный доступ: живая отрисовка выключена.
   *
   * Кнопку убираем НЕ ВМЕСТО серверного отказа, а вместе с ним
   * (`lib/aiAccess.ts`): кнопка, отвечающая красной строкой, на встрече с
   * компанией выглядит хуже, чем её отсутствие с объяснением.
   */
  demoPlan?: boolean;
  /** Единственная визуализация демо-режима уже потрачена. */
  demoSpent?: boolean;
};

export default function RenderPanel({
  variants,
  onOpen,
  styleId,
  onStyleChange,
  busy,
  error,
  onRender,
  onRerender,
  roomPhoto,
  demoPlan = false,
  demoSpent = false,
}: Props) {
  const debug = useDebug();

  const renderVariants = useInteriorStore((s) => s.renderVariants);
  const state = renderVariants.find((v) => v.styleId === styleId);
  const started = Boolean(state);
  const style = getStyle(styleId);

  return (
    <div>
      {/* Стиль — рядом с кнопкой: его выбирают в тот же момент. */}
      <div className="flex flex-wrap items-center gap-2">
        {RENDER_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => onStyleChange(choice.id)}
            aria-pressed={styleId === choice.id}
            disabled={busy}
            className={`mw-btn ${styleId === choice.id ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {choice.title}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRender}
          disabled={busy || demoSpent}
          className="mw-btn mw-btn-primary"
        >
          {busy ? 'Снимаем кадр…' : started ? 'Отрисовать заново' : 'Отрисовать кухню'}
        </button>
        {/* Цена клика названа ДО нажатия, а не после отказа. */}
        {demoPlan && (
          <p className="max-w-[42ch] text-[13px] leading-snug text-graphiteMw">
            {demoSpent ? DEMO_QUOTA_SPENT : DEMO_QUOTA_HINT}
          </p>
        )}
        {!demoPlan && !roomPhoto && (
          <p className="text-[13px] leading-snug text-tape">
            Без фото помещения клиент увидит настроение, а не свою квартиру.
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}

      {/* Карточка одна и крупная: это результат, а не набор миниатюр. */}
      <div className="mt-4 grid max-w-2xl gap-3">
        {variants.map((variant) => (
          <figure key={variant.key} className="mw-panel-flat overflow-hidden">
            <div className="relative aspect-[3/2] w-full bg-navyDeep">
              {state?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.image}
                  alt={variant.title}
                  onClick={() => state.image && onOpen?.(state.image)}
                  className="mw-appear h-full w-full cursor-zoom-in object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-graphiteMw">
                  {!started
                    ? 'Кадр ещё не снят'
                    : state?.status === 'error'
                      ? (state.error ?? 'Ошибка')
                      : state?.status === 'rendering'
                        ? 'Рисуем…'
                        : 'В очереди'}
                </div>
              )}
            </div>

            <figcaption className="p-4">
              <span className="block text-[17px] font-medium leading-tight">
                {variant.title}
              </span>
              <span className="mw-num mt-1 block text-[15px]">
                {formatMoney(variant.estimate.total)} ₸
              </span>
              <span className="mt-2 flex items-baseline gap-3 text-[13px] text-graphiteMw">
                <span>
                  {style?.ru ?? styleId}
                  {debug && state?.durationMs
                    ? ` · ${Math.round(state.durationMs / 1000)} с`
                    : ''}
                </span>
                {started && state?.status !== 'rendering' && (
                  <button
                    type="button"
                    onClick={() => onRerender(variant)}
                    disabled={busy}
                    className="ml-auto text-[13px] text-cyan underline disabled:opacity-40"
                  >
                    Перерисовать
                  </button>
                )}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
