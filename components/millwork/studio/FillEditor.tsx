'use client';

import { useState } from 'react';
import {
  addBayShelf,
  bayLayout,
  distributeBayShelves,
  moveBayShelf,
  removeBayShelf,
  removePartition,
  removePartitionNote,
  setBayShelfCount,
  setBayWidth,
  splitBay,
  type BayEdit,
  type BayEnvelope,
} from '@/lib/millwork/bays';
import { snapTo32 } from '@/lib/millwork/fill';
import type { Module, ModuleFill } from '@/types/millwork';

/**
 * ВНУТРЕННЕЕ НАПОЛНЕНИЕ ШКАФА — ОТСЕКИ И ПОЛКИ (R01).
 *
 * Панель ничего не считает сама: каждое нажатие — операция над отсеками
 * (`splitBay`, `setBayWidth`, `addBayShelf`…), а она возвращает новое
 * наполнение или отказ словами с числом. Наполнение уходит в ряд
 * операцией `set_fill` — той же дверью, что любая правка; числа на
 * панели (ширины отсеков, длины и высоты полок) — из `bayLayout`, по
 * которой режет раскрой и рисует сцена. Своя арифметика здесь показала
 * бы полку, которой нет ни в цеху, ни в 3D.
 *
 * Выбранный отсек — состояние выделения в сторе сцены: его же подсвечивают
 * схема и 3D.
 */

type Props = {
  unit: Module;
  envelope: BayEnvelope;
  /** Выбранный отсек ЭТОГО модуля; `null` — первый. */
  selectedBayId: string | null;
  onSelectBay: (bayId: string) => void;
  onFill: (fill: ModuleFill) => void;
  /** Отказ — операции или движка — словами. */
  notice: string | null;
  onNotice: (text: string | null) => void;
};

function shelvesWord(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return 'полок';
  const last = n % 10;
  if (last === 1) return 'полка';
  if (last >= 2 && last <= 4) return 'полки';
  return 'полок';
}

export default function FillEditor({
  unit,
  envelope,
  selectedBayId,
  onSelectBay,
  onFill,
  notice,
  onNotice,
}: Props) {
  const layout = bayLayout(unit, envelope);
  const [widthDraft, setWidthDraft] = useState<string | null>(null);
  /** Полка встала не на введённое число, а на ближайшее отверстие — сказано. */
  const [snapNote, setSnapNote] = useState<string | null>(null);

  const apply = (edit: BayEdit, after?: () => void) => {
    setSnapNote(null);
    if ('refusal' in edit) {
      onNotice(edit.refusal);
      return;
    }
    onNotice(null);
    onFill(edit.fill);
    after?.();
  };

  const drilling = (
    <p className="mt-2 text-[12px] leading-snug text-tape" data-fill-drilling>
      Присадка под полки не рассчитана: крепление полок цехом не подтверждено. Раскрой и смета
      считаются, отверстий в выгрузке нет — сверлить по ней нечего.
    </p>
  );

  const noticeLine = notice ? (
    <p className="mt-2 text-[13px] leading-snug text-alert" data-fill-refusal>
      {notice}
    </p>
  ) : null;

  /* ── Модуль без отсеков: прежнее наполнение и одна кнопка. ── */
  if (!layout) {
    const fill = unit.fill;
    const trial = splitBay(unit, envelope);
    return (
      <section className="mt-3 border-t border-blueprint/20 pt-3" data-fill-editor={unit.id} data-fill-split="no">
        <h3 className="text-[13px] font-medium">Внутреннее наполнение</h3>
        <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
          {fill && fill.shelves.length > 0
            ? `${fill.shelves.length} ${shelvesWord(fill.shelves.length)} на всю внутреннюю ширину ${envelope.widthMm - 2 * envelope.thicknessMm} мм.`
            : `Отсек один: ${envelope.widthMm - 2 * envelope.thicknessMm} мм в свету, полок нет.`}
        </p>
        {'refusal' in trial ? (
          <p className="mt-2 text-[13px] leading-snug text-graphiteMw" data-fill-blocked>
            {trial.refusal}
          </p>
        ) : (
          <button
            type="button"
            data-fill-action="split"
            onClick={() => apply(trial, () => onSelectBay('b1'))}
            className="mw-btn mw-btn-ghost mt-2 w-full"
          >
            Разделить вертикально
          </button>
        )}
        {noticeLine}
        {fill && fill.shelves.length > 0 && drilling}
      </section>
    );
  }

  const bay = layout.bays.find((item) => item.id === selectedBayId) ?? layout.bays[0];
  const isLast = bay.index === layout.bays.length - 1;
  const partitionNote = isLast ? null : removePartitionNote(unit, envelope, bay.id);
  const width = widthDraft ?? String(bay.widthMm);
  const commitWidth = () => {
    const value = Number(width);
    setWidthDraft(null);
    if (value === bay.widthMm) return;
    apply(setBayWidth(unit, envelope, bay.id, value));
  };

  return (
    <section
      className="mt-3 border-t border-blueprint/20 pt-3"
      data-fill-editor={unit.id}
      data-fill-split="yes"
      data-fill-bays={layout.bays.length}
    >
      <h3 className="text-[13px] font-medium">Внутреннее наполнение</h3>
      <p className="mw-num mt-1 text-[12px] text-graphiteMw">
        Внутри {layout.innerWidthMm} мм · перегородок {layout.partitions.length} по{' '}
        {envelope.thicknessMm} мм · корпус {envelope.widthMm} × {envelope.heightMm} × {envelope.depthMm}
      </p>

      {/* Отсеки слева направо — нажатием выбирается тот, что правится ниже. */}
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Отсеки">
        {layout.bays.map((item) => (
          <button
            key={item.id}
            type="button"
            data-bay-chip={item.id}
            data-bay-width={item.widthMm}
            data-bay-shelves={item.shelves.length}
            aria-pressed={item.id === bay.id}
            onClick={() => {
              setWidthDraft(null);
              setSnapNote(null);
              onNotice(null);
              onSelectBay(item.id);
            }}
            className={`mw-btn mw-num px-2 text-[13px] ${item.id === bay.id ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            Отсек {item.index + 1} · {item.widthMm} мм · {item.shelves.length} {shelvesWord(item.shelves.length)}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3" data-bay-editor={bay.id}>
        <form
          className="block"
          onSubmit={(event) => {
            event.preventDefault();
            commitWidth();
          }}
        >
          <label className="block">
            <span className="mw-label">Ширина секции, мм</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              data-bay-width-input
              value={width}
              disabled={layout.bays.length < 2}
              onChange={(event) => setWidthDraft(event.target.value)}
              className="mw-num mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px] disabled:opacity-40"
            />
          </label>
          <button
            type="submit"
            data-fill-action="set-width"
            disabled={layout.bays.length < 2}
            className="mw-btn mw-btn-ghost mt-1 w-full disabled:opacity-40"
          >
            Изменить ширину секции
          </button>
          <span className="mt-1 block text-[12px] leading-snug text-graphiteMw">
            Корпус остаётся {envelope.widthMm} мм: разницу забирает{' '}
            {isLast ? 'отсек слева' : 'отсек справа'}.
          </span>
        </form>

        <label className="block">
          <span className="mw-label">Количество полок</span>
          <input
            key={`${bay.id}:${bay.shelves.length}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            data-bay-count-input
            defaultValue={bay.shelves.length}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (value === bay.shelves.length) return;
              apply(setBayShelfCount(unit, envelope, bay.id, value));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
            className="mw-num mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px]"
          />
        </label>

        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            data-fill-action="add-shelf"
            onClick={() => apply(addBayShelf(unit, envelope, bay.id))}
            className="mw-btn mw-btn-ghost"
          >
            Добавить полку
          </button>
          <button
            type="button"
            data-fill-action="distribute"
            disabled={bay.shelves.length === 0}
            onClick={() => apply(distributeBayShelves(unit, envelope, bay.id))}
            className="mw-btn mw-btn-ghost disabled:opacity-40"
          >
            Распределить полки
          </button>
          <button
            type="button"
            data-fill-action="split"
            onClick={() => apply(splitBay(unit, envelope, bay.id))}
            className="mw-btn mw-btn-ghost"
          >
            Разделить вертикально
          </button>
          {!isLast && (
            <button
              type="button"
              data-fill-action="remove-partition"
              title={partitionNote ?? undefined}
              onClick={() => apply(removePartition(unit, envelope, bay.id))}
              className="mw-btn mw-btn-ghost"
            >
              Убрать перегородку справа
            </button>
          )}
        </div>
        {partitionNote && (
          <p className="text-[12px] leading-snug text-graphiteMw" data-partition-note>
            Убрать перегородку справа: {partitionNote}
          </p>
        )}

        {/* Полки снизу вверх: высота центра от дна корпуса и деталь из раскроя. */}
        {bay.shelves.length > 0 ? (
          <ul className="grid gap-1" aria-label="Полки отсека">
            {bay.shelves.map((shelf) => (
              <li
                key={shelf.partId}
                data-shelf-row={shelf.partId}
                data-shelf-at={shelf.atMm}
                className="flex flex-wrap items-center gap-2 text-[13px]"
              >
                <span className="w-[4.5rem] text-graphiteMw">Полка {shelf.index + 1}</span>
                <label className="flex items-center gap-1">
                  <span className="sr-only">Высота полки, мм</span>
                  <input
                    key={`${shelf.partId}:${shelf.atMm}`}
                    type="number"
                    inputMode="numeric"
                    step={32}
                    data-shelf-height-input
                    aria-label={`Высота полки ${shelf.index + 1}, мм`}
                    defaultValue={shelf.atMm}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (value === shelf.atMm) return;
                      const edit = moveBayShelf(unit, envelope, bay.id, shelf.index, value);
                      apply(edit);
                      const snapped = snapTo32(value);
                      if (!('refusal' in edit) && snapped !== value) {
                        setSnapNote(
                          `Полка встала на ${snapped} мм, а не на ${value}: отверстия под полкодержатели идут шагом 32 мм.`,
                        );
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                    }}
                    className="mw-num mw-touch w-20 border border-blueprint/40 bg-field px-1.5 text-[13px]"
                  />
                  <span className="text-graphiteMw">мм</span>
                </label>
                <span className="mw-num text-[12px] text-graphiteMw" data-bay-shelf-size>
                  {shelf.lengthMm} × {shelf.depthMm} × {shelf.thicknessMm}
                </span>
                <button
                  type="button"
                  data-fill-action="remove-shelf"
                  aria-label={`Удалить полку ${shelf.index + 1}`}
                  onClick={() => apply(removeBayShelf(unit, envelope, bay.id, shelf.index))}
                  className="mw-btn mw-btn-ghost ml-auto px-2"
                >
                  Удалить полку
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-graphiteMw" data-bay-empty>
            Полок в отсеке нет.
          </p>
        )}
        <p className="text-[12px] leading-snug text-graphiteMw">
          Высота полки — от дна корпуса до её середины; полка садится на отверстия шагом 32 мм.
        </p>
      </div>

      {snapNote && (
        <p className="mt-2 text-[13px] leading-snug text-tape" data-fill-snap>
          {snapNote}
        </p>
      )}
      {layout.problems.map((problem) => (
        <p key={problem} className="mt-2 text-[13px] leading-snug text-alert" data-fill-problem>
          {problem}
        </p>
      ))}
      {noticeLine}
      {drilling}
    </section>
  );
}
