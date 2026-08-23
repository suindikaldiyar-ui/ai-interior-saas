'use client';

import { useState } from 'react';
import { useDebug } from '@/lib/debug';
import {
  MILLWORK_STYLE_IDS,
  VARIANT_STYLE,
  rerenderMillworkVariant,
  runMillworkRenders,
} from '@/lib/millwork/render';
import { getStyle } from '@/lib/renderStyles';
import { formatMoney } from '@/lib/millwork/estimate';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { RunAngle } from '@/types/render';
import type { Variant } from '@/types/millwork';

/**
 * Кухня в квартире клиента.
 *
 * Комплектация одна: три бюджета усложняли разговор, клиент сравнивал
 * картинки вместо того, чтобы решать. Фотография и артикул выбираются шагом
 * раньше — здесь только результат: одна кнопка, одна картинка и повтор.
 */

type Props = {
  variants: Variant[];
  roomPhoto?: string | null;
  angle: RunAngle;
  onOpen?: (image: string) => void;
  /** Объект в базе: с ним картинки уезжают в Storage сразу после отрисовки. */
  projectId?: string | null;
};

export default function RenderPanel({
  variants,
  roomPhoto,
  angle,
  onOpen,
  projectId,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debug = useDebug();

  const renderVariants = useInteriorStore((s) => s.renderVariants);
  const byStyle = new Map(renderVariants.map((v) => [v.styleId, v]));
  const started = renderVariants.some((v) => MILLWORK_STYLE_IDS.includes(v.styleId));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await runMillworkRenders({ variants, roomPhoto, angle, projectId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Кадр снять не удалось.');
    } finally {
      setBusy(false);
    }
  };

  /** Повтор одного варианта: кадр остаётся тем же, меняется только картинка. */
  const again = async (variant: Variant) => {
    setBusy(true);
    setError(null);
    try {
      await rerenderMillworkVariant(variant, roomPhoto, projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Повтор не удался.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={busy} className="mw-btn mw-btn-primary">
          {busy ? 'Снимаем кадр…' : 'Отрисовать кухню'}
        </button>
        {!roomPhoto && (
          <p className="text-[13px] leading-snug text-tape">
            Без фото помещения клиент увидит настроение, а не свою квартиру.
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}

      {/* Карточка одна и крупная: это результат, а не набор миниатюр. */}
      <div className="mt-4 grid max-w-2xl gap-3">
        {variants.map((variant) => {
          const styleId = VARIANT_STYLE[variant.key];
          const state = byStyle.get(styleId);
          const style = getStyle(styleId);

          return (
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
                      onClick={() => void again(variant)}
                      disabled={busy}
                      className="ml-auto text-[13px] text-cyan underline disabled:opacity-40"
                    >
                      Перерисовать
                    </button>
                  )}
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
