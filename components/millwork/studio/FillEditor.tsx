'use client';

import { useState } from 'react';
import {
  addBayShelf,
  addDrawerStack,
  bayLayout,
  distributeBayShelves,
  distributeDrawers,
  drawerStackReadiness,
  moveBayShelf,
  removeBayShelf,
  removeDrawerStack,
  removeDrawerStackNote,
  removePartition,
  removePartitionNote,
  setBayShelfCount,
  setBayWidth,
  setDrawerCount,
  setDrawerHeight,
  setDrawerSlide,
  setDrawerZone,
  splitBay,
  type BayEdit,
  type BayEnvelope,
  type ResolvedDrawerStack,
} from '@/lib/millwork/bays';
import { DRAWER_TRAVEL_M } from '@/lib/millwork/cabinetBoxes';
import { snapTo32 } from '@/lib/millwork/fill';
import type { HardwareItem } from '@/types/catalog';
import type { BayDrawerStack, Module, ModuleFill } from '@/types/millwork';

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
  /** Направляющие каталога организации (`category: 'slide'`), из чего выбирать (R02A). */
  slides?: HardwareItem[];
  /** Выбранный ящик отсека: `«<модуль>:<отсек>:drawer:<n>»`. */
  selectedDrawerId?: string | null;
  onSelectDrawer?: (drawerId: string) => void;
  /** Что открыто в сцене — тот же список, что у «Открыть всё». */
  openIds?: string[];
  onToggleOpen?: (id: string) => void;
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
  slides = [],
  selectedDrawerId = null,
  onSelectDrawer,
  openIds = [],
  onToggleOpen,
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
            data-bay-drawers={item.drawerStack?.drawers.length ?? 0}
            aria-pressed={item.id === bay.id}
            onClick={() => {
              setWidthDraft(null);
              setSnapNote(null);
              onNotice(null);
              onSelectBay(item.id);
            }}
            className={`mw-btn mw-num px-2 text-[13px] ${item.id === bay.id ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            Отсек {item.index + 1} · {item.widthMm} мм ·{' '}
            {item.drawerStack ? `${item.drawerStack.drawers.length} ящ.` : `${item.shelves.length} ${shelvesWord(item.shelves.length)}`}
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

        {!bay.drawerStack && (
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
        )}

        <div className="grid grid-cols-2 gap-1">
          {!bay.drawerStack && (
            <>
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
            </>
          )}
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
          {!bay.drawerStack && (
            <button
              type="button"
              data-drawer-action="add"
              onClick={() => apply(addDrawerStack(unit, envelope, bay.id))}
              className="mw-btn mw-btn-ghost"
            >
              Добавить блок ящиков
            </button>
          )}
        </div>
        {partitionNote && (
          <p className="text-[12px] leading-snug text-graphiteMw" data-partition-note>
            Убрать перегородку справа: {partitionNote}
          </p>
        )}

        {bay.drawerStack && (
          <DrawerStackEditor
            unit={unit}
            envelope={envelope}
            stack={bay.drawerStack}
            raw={unit.fill?.bays?.find((item) => item.id === bay.id)?.drawers ?? null}
            slides={slides}
            selectedDrawerId={selectedDrawerId}
            onSelectDrawer={onSelectDrawer}
            openIds={openIds}
            onToggleOpen={onToggleOpen}
            apply={apply}
          />
        )}

        {/* Полки снизу вверх: высота центра от дна корпуса и деталь из раскроя. */}
        {bay.drawerStack ? null : bay.shelves.length > 0 ? (
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
        {!bay.drawerStack && (
          <p className="text-[12px] leading-snug text-graphiteMw">
            Высота полки — от дна корпуса до её середины; полка садится на отверстия шагом 32 мм.
          </p>
        )}
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

/**
 * БЛОК ЯЩИКОВ ОТСЕКА (R02A) — поля и кнопки инспектора.
 *
 * Каждое нажатие — операция над блоком (`setDrawerCount`, `setDrawerZone`…)
 * с отказом словами; числа — из `bayLayout`. Статус выпуска считает
 * `drawerStackReadiness`: пока нет подтверждённой направляющей и правил
 * короба цеха, блок — черновик, и это написано здесь же.
 */
function DrawerStackEditor({
  unit,
  envelope,
  stack,
  raw,
  slides,
  selectedDrawerId,
  onSelectDrawer,
  openIds,
  onToggleOpen,
  apply,
}: {
  unit: Module;
  envelope: BayEnvelope;
  stack: ResolvedDrawerStack;
  raw: BayDrawerStack | null;
  slides: HardwareItem[];
  selectedDrawerId: string | null;
  onSelectDrawer?: (drawerId: string) => void;
  openIds: string[];
  onToggleOpen?: (id: string) => void;
  apply: (edit: BayEdit) => void;
}) {
  const slide = raw?.slideItemId ? (slides.find((item) => item.id === raw.slideItemId) ?? null) : null;
  const readiness = raw ? drawerStackReadiness(raw, slide, null, stack.depthMm) : null;
  const removeNote = removeDrawerStackNote(unit, stack.bayId);
  const selected = stack.drawers.find((drawer) => drawer.id === selectedDrawerId) ?? null;
  const t = envelope.thicknessMm;
  const commitOnEnter = (event: { key: string; target: EventTarget }) => {
    if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
  };
  const field = 'mw-num mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px]';

  return (
    <div
      className="grid gap-3 border-t border-blueprint/20 pt-3"
      data-drawer-stack={stack.id}
      data-drawer-bay={stack.bayId}
      data-drawer-count={stack.drawers.length}
      data-drawer-zone={`${stack.fromMm - t}+${stack.heightMm}`}
    >
      <p className="text-[13px] font-medium">Блок ящиков · {stack.drawers.length} ящ.</p>
      <div className="rounded-[var(--r-control)] bg-tape/10 px-3 py-2" data-drawer-status={readiness?.ready ? 'ready' : 'draft'}>
        <p className="text-[12px] leading-snug text-tape">
          {readiness?.ready
            ? 'Короб рассчитан по подтверждённому профилю.'
            : 'Черновик: короб ящика не рассчитан — фасады режутся, короба нет ни в раскрое, ни в присадке; в цех не выпускается.'}
        </p>
        {readiness && !readiness.ready && (
          <ul className="mt-1 grid gap-[2px] text-[12px] leading-snug text-tape" data-drawer-missing>
            {readiness.missing.map((line) => (
              <li key={line}>Не хватает: {line}</li>
            ))}
          </ul>
        )}
      </div>

      <label className="block">
        <span className="mw-label">Количество ящиков</span>
        <input
          key={`count:${stack.drawers.length}`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          data-drawer-count-input
          defaultValue={stack.drawers.length}
          onBlur={(event) => {
            const value = Number(event.target.value);
            if (value === stack.drawers.length) return;
            apply(setDrawerCount(unit, envelope, stack.bayId, value));
          }}
          onKeyDown={commitOnEnter}
          className={field}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mw-label">Низ блока над дном, мм</span>
          <input
            key={`from:${stack.fromMm}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            data-drawer-from-input
            defaultValue={stack.fromMm - t}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (value === stack.fromMm - t) return;
              apply(setDrawerZone(unit, envelope, stack.bayId, { fromMm: value }));
            }}
            onKeyDown={commitOnEnter}
            className={field}
          />
        </label>
        <label className="block">
          <span className="mw-label">Высота блока, мм</span>
          <input
            key={`height:${stack.heightMm}`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            data-drawer-height-input
            defaultValue={stack.heightMm}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (value === stack.heightMm) return;
              apply(setDrawerZone(unit, envelope, stack.bayId, { heightMm: value }));
            }}
            onKeyDown={commitOnEnter}
            className={field}
          />
        </label>
      </div>
      <p className="text-[12px] leading-snug text-graphiteMw">
        Зона блока {stack.fromMm}…{stack.toMm} мм от низа корпуса; выше — отсек свободен.
      </p>

      <ul className="grid gap-1" aria-label="Ящики блока">
        {stack.drawers.map((drawer) => {
          const open = openIds.includes(drawer.id);
          const slot = drawer.slotToMm - drawer.slotFromMm;
          return (
            <li
              key={drawer.id}
              data-drawer-row={drawer.id}
              data-drawer-slot={slot}
              data-drawer-front={`${drawer.front.widthMm}x${drawer.front.heightMm}x${drawer.front.thicknessMm}`}
              data-drawer-selected-row={drawer.id === selectedDrawerId ? '1' : '0'}
              className={`flex flex-wrap items-center gap-2 rounded-[var(--r-control)] px-1 text-[13px] ${
                drawer.id === selectedDrawerId ? 'bg-[var(--accent)]/15' : ''
              }`}
            >
              <button
                type="button"
                data-drawer-select={drawer.id}
                aria-pressed={drawer.id === selectedDrawerId}
                onClick={() => onSelectDrawer?.(drawer.id)}
                className="mw-btn mw-btn-ghost px-2"
              >
                Ящик {drawer.index + 1}
              </button>
              <label className="flex items-center gap-1">
                <span className="sr-only">Высота зоны ящика, мм</span>
                <input
                  key={`${drawer.id}:${slot}`}
                  type="number"
                  inputMode="numeric"
                  step={1}
                  data-drawer-slot-input
                  aria-label={`Высота зоны ящика ${drawer.index + 1}, мм`}
                  defaultValue={slot}
                  onBlur={(event) => {
                    const value = Number(event.target.value);
                    if (value === slot) return;
                    apply(setDrawerHeight(unit, envelope, stack.bayId, drawer.index, value));
                  }}
                  onKeyDown={commitOnEnter}
                  className="mw-num mw-touch w-20 border border-blueprint/40 bg-field px-1.5 text-[13px]"
                />
                <span className="text-graphiteMw">мм</span>
              </label>
              <span className="mw-num text-[12px] text-graphiteMw" data-drawer-front-size>
                фасад {drawer.front.widthMm} × {drawer.front.heightMm} × {drawer.front.thicknessMm}
              </span>
              <button
                type="button"
                data-drawer-action="toggle"
                data-drawer-toggle={drawer.id}
                data-drawer-open={open ? '1' : '0'}
                onClick={() => onToggleOpen?.(drawer.id)}
                className="mw-btn mw-btn-ghost ml-auto px-2"
              >
                {open ? 'Закрыть' : 'Открыть'}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        data-drawer-action="distribute"
        onClick={() => apply(distributeDrawers(unit, envelope, stack.bayId))}
        className="mw-btn mw-btn-ghost"
      >
        Распределить поровну
      </button>

      {selected && (
        <p className="mw-num text-[12px] leading-snug text-graphiteMw" data-drawer-selected={selected.id}>
          Ящик {selected.index + 1}: зона {selected.slotFromMm}…{selected.slotToMm} мм от низа корпуса; фасад{' '}
          {selected.front.widthMm} × {selected.front.heightMm} × {selected.front.thicknessMm} на {selected.front.xFromMm}…
          {selected.front.xToMm} мм; габарит рабочей зоны (справочно) {selected.envelope.xToMm - selected.envelope.xFromMm} ×{' '}
          {selected.envelope.yToMm - selected.envelope.yFromMm} × {selected.envelope.depthMm} мм.
        </p>
      )}

      <p className="text-[12px] leading-snug text-graphiteMw" data-drawer-front-kind>
        Тип фасадов: вкладной в проём отсека — зазор цеха {envelope.frontGapMm} мм по контуру и между фасадами. Другие
        фасады ящиков — следующий этап.
      </p>

      <label className="block">
        <span className="mw-label">Направляющие</span>
        <select
          data-drawer-slide-select
          value={raw?.slideItemId ?? ''}
          disabled={slides.length === 0}
          onChange={(event) => apply(setDrawerSlide(unit, envelope, stack.bayId, event.target.value || null))}
          className={`${field} disabled:opacity-60`}
        >
          <option value="">не выбраны</option>
          {slides.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.article}
            </option>
          ))}
        </select>
        {slides.length === 0 && (
          <span className="mt-1 block text-[12px] leading-snug text-graphiteMw" data-drawer-no-slides>
            В каталоге организации направляющих нет — выбрать не из чего.
          </span>
        )}
      </label>

      <p className="text-[12px] leading-snug text-graphiteMw">
        Полезная глубина ящика {stack.depthMm} мм. Выдвижение в 3D — наглядное, {Math.round(DRAWER_TRAVEL_M * 1000)} мм:
        ход настоящей направляющей не выбран.
      </p>

      <button
        type="button"
        data-drawer-action="remove"
        onClick={() => apply(removeDrawerStack(unit, envelope, stack.bayId))}
        className="mw-btn mw-btn-ghost text-alert"
      >
        Удалить блок
      </button>
      {removeNote && (
        <p className="text-[12px] leading-snug text-graphiteMw" data-drawer-remove-note>
          Удалить блок: {removeNote}
        </p>
      )}
    </div>
  );
}
