'use client';

import FrontGlyph from './FrontGlyph';
import { formatMoney } from '@/lib/millwork/estimate';
import type { Module, ModuleVariantKind } from '@/types/millwork';

/**
 * ЛЕНТА ПРЕВЬЮ ВАРИАНТОВ.
 *
 * Список названий не работает: мебельщик держит варианты в голове
 * КАРТИНКАМИ, и клиент выбирает глазами. «Карго» и «ящик с дверцей» — это
 * два слова, между которыми клиент не выбирает; два рисунка — выбирает
 * мгновенно.
 *
 * Каждая карточка — НАСТОЯЩИЙ мини-чертёж этого модуля с этим вариантом,
 * нарисованный тем же `FrontGlyph`, что и большой чертёж. Заготовленная
 * иконка разошлась бы с чертежом на первой же правке, а новый вариант
 * требовал бы работы художника; здесь он появляется сам.
 *
 * Под схемой — РАЗНИЦА в цене, а не сумма: клиент на встрече решает,
 * стоит ли эта дверца лишних восемнадцати тысяч, а не сравнивает два
 * шестизначных числа.
 */

export type VariantPreview = {
  kind: ModuleVariantKind;
  title: string;
  hint: string;
  /** Модуль с применённым вариантом — из него и рисуется схема. */
  unit: Module;
  /** Высота модуля в миллиметрах: схема должна быть в пропорции. */
  heightMm: number;
  /** Разница показанного итога. `null` — вариант не собирается. */
  deltaKzt: number | null;
  /** Почему не собирается — словами. */
  refusal?: string;
  active: boolean;
};

type Props = {
  options: VariantPreview[];
  onPick: (kind: ModuleVariantKind) => void;
  /**
   * ЧЕЙ ЭТО ВЫБОР. Пусто — не выбрано ничего.
   *
   * Подпись обязательна везде, где лента показывается. Без неё лента
   * молча метит в модуль, который мог остаться выделенным с другого
   * вида: человек жмёт «Витрину», а она уходит туда, куда он не смотрит.
   */
  moduleLabel?: string | null;
  /**
   * Что написать, когда модуль не выбран.
   *
   * Пусто — не показываем ничего. Там, где выделение делается прямо на
   * этом экране, пустое место читается как «сломалось»: подсказка
   * называет действие.
   */
  pickPrompt?: string;
};

/** Размер карточки: схема читается с расстояния вытянутой руки. */
const CARD_W = 96;
const CARD_H = 108;

export default function VariantStrip({
  options,
  onPick,
  moduleLabel,
  pickPrompt,
}: Props) {
  /*
   * ТРИ СОСТОЯНИЯ, И НИ ОДНО ИЗ НИХ НЕ ПУСТОЕ МЕСТО.
   *
   * Раньше их было два, и оба выглядели одинаково — лента просто
   * исчезала. Отличить «ничего не выбрано» от «у этого модуля выбора
   * нет» было нельзя, а таких модулей десять из одиннадцати: замерщик
   * жал на модуль, ничего не появлялось, и это читалось как несработавший
   * клик.
   */
  if (!moduleLabel) {
    if (!pickPrompt) return null;
    return (
      <p className="mw-label" data-variant-prompt>
        {pickPrompt}
      </p>
    );
  }

  if (options.length === 0) {
    return (
      <div className="print:hidden" data-variant-strip data-variant-empty>
        <p className="mw-label mb-1" data-variant-label>
          Что здесь бывает: {moduleLabel}
        </p>
        <p className="text-[13px] leading-snug text-graphiteMw">
          У этого модуля вариантов нет: в этом месте и такой ширине бывает
          только он.
        </p>
      </div>
    );
  }

  return (
    <div className="print:hidden" data-variant-strip>
      <p className="mw-label mb-2" data-variant-label>
        Что здесь бывает: {moduleLabel}
      </p>

      {/*
        * Лента прокручивается вбок и НЕ ЗАКРЫВАЕТСЯ после выбора: замерщик
        * перебирает варианты подряд, пока клиент смотрит.
        */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {options.map((option) => (
          <button
            key={option.kind}
            type="button"
            data-variant={option.kind}
            data-refused={option.refusal ? '1' : '0'}
            /*
             * Не собирается — не нажимается, и почему, сказано словами:
             * «та же цена» у варианта, которого не будет, — обещание.
             */
            disabled={Boolean(option.refusal)}
            onClick={() => {
              if (!option.refusal) onPick(option.kind);
            }}
            aria-pressed={option.active}
            title={option.refusal ?? option.hint}
            className={`mw-panel-flat shrink-0 p-2 text-left ${
              option.refusal ? 'cursor-not-allowed opacity-45 ' : ''
            }${
              option.active ? 'ring-2 ring-inset ring-cyan' : ''
            }`}
            style={{ width: CARD_W }}
          >
            <svg
              viewBox={`0 0 ${CARD_W - 16} ${CARD_H - 52}`}
              width="100%"
              role="img"
              aria-label={option.title}
            >
              {/* Контур модуля — та же рамка, что на большом чертеже. */}
              <rect
                x={2}
                y={2}
                width={CARD_W - 20}
                height={CARD_H - 56}
                fill="none"
                stroke="var(--blueprint)"
                strokeWidth={0.8}
              />
              <FrontGlyph
                unit={option.unit}
                mode="fronts"
                x={2}
                y={2}
                width={CARD_W - 20}
                height={CARD_H - 56}
              />
            </svg>

            <div className="mt-1 truncate text-[13px] leading-tight">{option.title}</div>
            <div className="mw-num text-[13px] leading-tight text-graphiteMw">
              {option.refusal
                ? 'не встанет'
                : option.active
                  ? 'сейчас'
                  : option.deltaKzt === 0 || option.deltaKzt === null
                    ? 'та же цена'
                    : `${option.deltaKzt > 0 ? '+' : '−'}${formatMoney(Math.abs(option.deltaKzt))} ₸`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
