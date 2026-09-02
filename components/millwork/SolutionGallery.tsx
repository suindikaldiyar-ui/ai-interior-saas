'use client';

import { useMemo, useState } from 'react';
import ElevationDrawing from './ElevationDrawing';
import { buildRun } from '@/lib/millwork/layout';
import { buildEstimate, formatMoney, type RateTable } from '@/lib/millwork/estimate';
import { MAIN_VARIANT, withStrategy, activeStrategies, DEFAULT_STRATEGIES } from '@/lib/millwork/variants';
import { requirementsFromTemplate, templatesForZone, type RunTemplate } from '@/lib/millwork/templates';
import type { CommPoint, Opening, Run, RunOptions, VariantKey, ZoneKind } from '@/types/millwork';

/**
 * ГАЛЕРЕЯ ГОТОВЫХ РЕШЕНИЙ РЯДОМ С ЧЕРТЕЖОМ.
 *
 * Шаблон выбирался один раз на втором шаге и исчезал: чтобы посмотреть
 * другое решение, надо было вернуться назад и потерять правки. А на встрече
 * всё наоборот — клиент смотрит и спрашивает «а по-другому можно?». В этот
 * момент замерщик должен нажать один раз, а не пройти два экрана.
 *
 * МАКЕТ КАЖДОЙ КАРТОЧКИ — ТОТ ЖЕ `ElevationDrawing`, только маленький.
 * Нарисованных картинок нет намеренно: они разошлись бы с настоящим
 * чертежом на первой же правке раскладки, а новое решение требовало бы
 * работы художника. Здесь оно появляется само.
 */

type Props = {
  zone: ZoneKind;
  /** Длина стены из замера: по ней собирается макет каждого решения. */
  lengthMm: number;
  ceilingHeightMm: number;
  openings: Opening[];
  comms: CommPoint[];
  rates: RateTable;
  options: RunOptions;
  variantKey: VariantKey;
  disabledKeys: string[];
  /** Решения компании: они идут первыми, с пометкой «ваше». */
  orgTemplates?: RunTemplate[];
  /** Что выбрано сейчас. Сверяем отпечатком, а не запомненным ключом. */
  currentFingerprint: string;
  currentTotal: number;
  onPick: (template: RunTemplate) => void;
  /** Вернуть то, что было до последнего выбора. */
  onUndo?: () => void;
  undoLabel?: string | null;
  /** Сохранить текущую конфигурацию как решение компании. */
  onSaveOwn?: (name: string) => Promise<void> | void;
};

type Card = {
  template: RunTemplate;
  run: Run;
  total: number;
  own: boolean;
};

export default function SolutionGallery({
  zone,
  lengthMm,
  ceilingHeightMm,
  openings,
  comms,
  rates,
  options,
  variantKey,
  disabledKeys,
  orgTemplates = [],
  currentFingerprint,
  currentTotal,
  onPick,
  onUndo,
  undoLabel,
  onSaveOwn,
}: Props) {
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownName, setOwnName] = useState('');

  /*
   * Каждая карточка собирается ТЕМ ЖЕ `buildRun` на текущей длине стены.
   * Это чистая функция: десяток вызовов — доли миллисекунды, зато макет
   * не может разойтись с тем, что соберётся после выбора.
   */
  const cards = useMemo<Card[]>(() => {
    const strategy =
      activeStrategies().find((s) => s.key === MAIN_VARIANT) ??
      DEFAULT_STRATEGIES.find((s) => s.key === MAIN_VARIANT)!;

    return templatesForZone(zone, orgTemplates).flatMap((template): Card[] => {
      // Решение, которое не собирается на этой стене, не показываем вовсе:
      // карточка, которая не соберётся, хуже её отсутствия.
      if (lengthMm < template.minLengthMm || lengthMm > template.maxLengthMm) return [];

      try {
        const run = buildRun({
          id: `gallery-${template.id}`,
          lengthMm,
          ceilingHeightMm,
          requirements: withStrategy(requirementsFromTemplate(template, options), strategy),
          openings,
          comms,
        });

        return [
          {
            template,
            run,
            total: buildEstimate(run, variantKey, rates, disabledKeys).total,
            own: template.id.startsWith('org:'),
          },
        ];
      } catch {
        return [];
      }
    });
  }, [
    zone,
    lengthMm,
    ceilingHeightMm,
    openings,
    comms,
    rates,
    options,
    variantKey,
    disabledKeys,
    orgTemplates,
  ]);

  if (cards.length < 2) return null;

  return (
    <section className="print:hidden">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-[15px] font-medium"
        >
          Готовые решения
        </button>
        <span className="text-[13px] text-graphiteMw">
          {cards.length} на стену {lengthMm} мм
        </span>

        {undoLabel && onUndo && (
          <button type="button" onClick={onUndo} className="mw-btn mw-btn-ghost ml-auto">
            Вернуть предыдущее
          </button>
        )}
      </div>

      {/*
        * Своё решение компании. Это и делает библиотеку активом компании,
        * а не нашим списком: «наша базовая на 2700» появится первой
        * с пометкой «ваше».
        */}
      {open && onSaveOwn && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            value={ownName}
            onChange={(e) => setOwnName(e.target.value)}
            placeholder="Назовите это решение"
            className="mw-field max-w-[260px]"
          />
          <button
            type="button"
            disabled={saving || ownName.trim().length < 2}
            onClick={async () => {
              setSaving(true);
              try {
                await onSaveOwn(ownName.trim());
                setOwnName('');
              } finally {
                setSaving(false);
              }
            }}
            className="mw-btn mw-btn-ghost"
          >
            {saving ? 'Сохраняем…' : 'Сохранить как решение'}
          </button>
        </div>
      )}

      {open && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-5">
          {cards.map((card) => {
            /*
             * Активная карточка определяется ОТПЕЧАТКОМ, а не запомненным
             * ключом: правил состав руками — не активна ни одна, и это
             * честно.
             */
            const active = card.run.fingerprint === currentFingerprint;
            const delta = Math.round(card.total - currentTotal);

            return (
              <button
                key={card.template.id}
                type="button"
                onClick={() => onPick(card.template)}
                aria-pressed={active}
                className={`mw-panel-flat text-left ${active ? 'ring-inset ring-2 ring-tape' : ''}`}
              >
                {/* Макет — тот же чертёж, только маленький. */}
                <ElevationDrawing run={card.run} compact />

                <span className="mt-1 block text-[13px] font-medium leading-tight">
                  {card.template.name}
                  {card.own && <span className="ml-1 text-tape">ваше</span>}
                </span>

                <span className="mw-num mt-0.5 block text-[13px] leading-tight">
                  {formatMoney(card.total)} ₸
                  {/*
                    * Разница с текущим: на встрече клиент решает по ней,
                    * а не по абсолютной сумме.
                    */}
                  {!active && delta !== 0 && (
                    <span className="ml-1 text-graphiteMw">
                      {delta > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(delta))}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
