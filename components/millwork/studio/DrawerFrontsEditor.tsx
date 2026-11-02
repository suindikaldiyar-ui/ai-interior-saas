'use client';

import { useMemo, useState } from 'react';
import type { HardwareItem } from '@/types/catalog';
import type { MillworkOp, Module, Run } from '@/types/millwork';
import {
  drawerFrontRows,
  drawerRowMinRefusal,
  evenDrawerFronts,
  parseShares,
  proportionalDrawerFronts,
  resizeDrawerFront,
  withDrawerFronts,
  withDrawerInners,
  withDrawerInsert,
  withDrawerSplit,
  DRAWER_INSERT_TITLE,
  type DrawerFrontRow,
  type DrawerFrontsResult,
} from '@/lib/millwork/drawerFronts';
import { drawerSplitOf } from '@/lib/millwork/drawerGrid';
import { moduleCarcassHeightMm } from '@/lib/millwork/fill';
import { frontPlan } from '@/lib/millwork/modules';
import { shopOf } from '@/lib/millwork/shop';

/**
 * ФАСАДЫ ЯЩИКОВ — РЕДАКТОР МОДУЛЯ (ТЗ 2026-11-02, A2–A4).
 *
 * Таблица — числами того же раскроя (`drawerFrontCutMm`), той же сцены и того же комплекта ящика
 * (`drawerFrontRows`). Человек вводит высоту ДЕТАЛИ ряда; место — деталь плюс зазор цеха. Деление на
 * столбцы — перегородка и перемычка (`drawerSplit`). Правки — операции движка (`set_fill`,
 * `set_fronts`) тем же `runOps`; ответ «встанет ли» — тот же `applyOps` вхолостую, его слова видны
 * до нажатия. Своей арифметики «влезет ли» здесь нет. Общую высоту модуля редактор не меняет.
 */
type Props = {
  unit: Module;
  run: Run;
  hardware?: Map<string, HardwareItem>;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run;
};

const MAX_COUNT = frontPlan('base', 600, 99).drawerCount;

export default function DrawerFrontsEditor({ unit, run, hardware, onOps, preview }: Props) {
  const production = shopOf(run.production);
  const cells = useMemo(() => drawerFrontRows(unit, run, production, hardware), [unit, run, production, hardware]);
  const split = drawerSplitOf(unit.fill, unit.widthMm);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [shares, setShares] = useState('');
  const [left, setLeft] = useState(String(split?.leftMm ?? Math.round(unit.widthMm / 2)));
  const [notice, setNotice] = useState<string | null>(null);

  if (cells.length === 0 || unit.fill?.bays?.length || !unit.fill) return null;
  const fill = unit.fill;
  const totalMm = Math.round(moduleCarcassHeightMm(unit, run));
  const gap = production.frontGapMm;
  const heights = fill.drawerHeights;
  const rowsCount = heights.length;
  const locked = heights.map((_, row) => cells.find((c) => c.row === row)?.locked ?? false);
  const byRow = heights.map((_, row) => cells.filter((c) => c.row === row));
  const canSplit = !unit.appliance && !unit.column;

  /* Правка — только если движок её примет: его отказ словами, ряд прежний. */
  const send = (ops: MillworkOp[]) => {
    const refusal = preview(ops).warnings[0] ?? null;
    if (refusal) {
      setNotice(refusal);
      return;
    }
    setNotice(null);
    setDrafts({});
    onOps(ops, (text) => setNotice(text));
  };
  const apply = (result: DrawerFrontsResult) => {
    if ('refusal' in result) {
      setNotice(result.refusal);
      return;
    }
    send([{ op: 'set_fill', moduleId: unit.id, fill: withDrawerFronts(fill, result.heights, result.locked) }]);
  };
  const commit = (row: number, first: DrawerFrontRow) => {
    const text = drafts[row];
    if (text === undefined) return;
    const value = Number(text.replace(',', '.').trim());
    if (!text.trim() || !Number.isFinite(value)) {
      setNotice(`Высота ряда ${row + 1} — число в миллиметрах.`);
      return;
    }
    if (Math.round(value) === first.heightMm) {
      setDrafts((d) => {
        const { [row]: _same, ...rest } = d;
        void _same;
        return rest;
      });
      return;
    }
    /* Введённое меньше минимума ряда — это и есть причина; перераспределять дальше незачем. */
    const tooLow = drawerRowMinRefusal(unit, row, Math.round(value) + gap, first.min, gap);
    if (tooLow) {
      setNotice(tooLow);
      return;
    }
    apply(resizeDrawerFront(heights, locked, row, Math.round(value) + gap, totalMm));
  };
  const toggleLock = (row: number) => {
    const next = [...locked];
    next[row] = !next[row];
    send([{ op: 'set_fill', moduleId: unit.id, fill: withDrawerFronts(fill, heights, next) }]);
  };
  const recount = (count: number) => send([{ op: 'set_fronts', moduleId: unit.id, drawerCount: count }]);
  const applySplit = (rows: number) => {
    const leftMm = Math.round(Number(left.replace(',', '.')));
    if (rows > 0 && !Number.isFinite(leftMm)) {
      setNotice('Ширина левого столбца — число в миллиметрах.');
      return;
    }
    send([{ op: 'set_fill', moduleId: unit.id, fill: withDrawerSplit(fill, rows, leftMm) }]);
  };
  const shareList = parseShares(shares);
  const setInners = (cell: number, text: string) => {
    const list = parseShares(text).map((mm) => Math.round(mm));
    if (list.some((mm) => !Number.isFinite(mm))) {
      setNotice('Зоны внутренних ящиков — миллиметры через запятую, сверху вниз.');
      return;
    }
    send([{ op: 'set_fill', moduleId: unit.id, fill: withDrawerInners(fill, cell, list) }]);
  };
  const setInsert = (leaf: string, kind: string, sections: number | undefined) =>
    send([
      {
        op: 'set_fill',
        moduleId: unit.id,
        fill: withDrawerInsert(fill, leaf, kind ? { kind: kind as keyof typeof DRAWER_INSERT_TITLE, ...(sections ? { sections } : {}) } : null),
      },
    ]);

  return (
    <section
      className="mw-panel grid gap-2"
      data-drawer-fronts={unit.id}
      data-drawer-fronts-total={totalMm}
      data-drawer-fronts-gap={gap}
      data-drawer-fronts-count={cells.length}
      data-drawer-fronts-rows={rowsCount}
      data-drawer-split={split ? `${split.leftMm}x${split.rows}` : ''}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-medium">Фасады ящиков</p>
        <div className="flex items-center gap-1" role="group" aria-label="Число рядов ящиков">
          <button
            type="button"
            className="mw-btn mw-touch px-3"
            disabled={rowsCount <= 1}
            onClick={() => recount(rowsCount - 1)}
            data-drawer-fronts-less
            aria-label="Меньше рядов"
          >
            −
          </button>
          <span className="mw-num min-w-[9ch] text-center text-[13px]">
            {rowsCount} {rowsCount === 1 ? 'ряд' : rowsCount < 5 ? 'ряда' : 'рядов'}
          </span>
          <button
            type="button"
            className="mw-btn mw-touch px-3"
            disabled={rowsCount >= MAX_COUNT}
            onClick={() => recount(rowsCount + 1)}
            data-drawer-fronts-more
            aria-label="Больше рядов"
            title={rowsCount >= MAX_COUNT ? `Больше ${MAX_COUNT} рядов ящиков в один модуль не ставят` : undefined}
          >
            +
          </button>
        </div>
      </div>
      <p className="text-[13px] leading-snug text-graphiteMw">
        Корпус {totalMm} мм — сумма мест рядов. Деталь = место − зазор цеха {gap} мм. Введённая высота закрепляет ряд;
        свободная высота — поровну незакреплённым. Высоту модуля редактор не меняет.
      </p>
      <ol className="grid gap-2">
        {byRow.map((rowCells, row) => {
          const first = rowCells[0];
          if (!first) return null;
          return (
            <li
              key={row}
              className="grid gap-1 border-b border-navyLine pb-2 text-[13px] last:border-b-0"
              data-drawer-row={row}
              data-row-slot={first.slotMm}
              data-row-locked={first.locked ? '1' : '0'}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {rowCells.length > 1 ? `Ряд ${row + 1} · фасады ${rowCells.map((c) => c.index + 1).join(' и ')}` : `Фасад ${first.index + 1}`}
                </span>
                <span>высота</span>
                <input
                  className="mw-field mw-num w-[7ch] px-2"
                  inputMode="numeric"
                  aria-label={`Высота ${rowCells.length > 1 ? `ряда ${row + 1}` : `фасада ${first.index + 1}`}, мм`}
                  value={drafts[row] ?? String(first.heightMm)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [row]: e.target.value }))}
                  onBlur={() => commit(row, first)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(row, first);
                  }}
                  data-row-input={row}
                />
                <span>мм</span>
                <button
                  type="button"
                  className="mw-btn mw-touch px-2 text-[13px]"
                  aria-pressed={first.locked}
                  onClick={() => toggleLock(row)}
                  data-row-lock={row}
                >
                  {first.locked ? 'Закреплён' : 'Зафиксировать высоту'}
                </button>
              </div>
              <div className="text-graphiteMw">
                место {first.slotMm} мм (фасад от {first.min.minSlotMm - gap} мм: {first.min.why})
              </div>
              {rowCells.map((cell) => (
                <div
                  key={cell.leaf}
                  className="grid gap-0.5 pl-2"
                  data-drawer-front={cell.index}
                  data-front-height={cell.heightMm}
                  data-front-width={cell.widthMm}
                  data-front-x={cell.xMm}
                  data-front-y={cell.yMm}
                  data-front-ready={cell.drawerReady ? '1' : '0'}
                >
                  <span>
                    Фасад {cell.index + 1}: <span className="mw-num">{cell.widthMm} × {cell.heightMm}</span> мм · X {cell.xMm} · Y {cell.yMm} мм от низа корпуса
                  </span>
                  <span className="text-graphiteMw">
                    Выдвижной · {cell.material} · {cell.thicknessMm} мм · ручка: {cell.handle}
                  </span>
                  <span className={cell.drawerReady ? 'text-graphiteMw' : 'text-alert'} data-front-drawer>
                    Ящик: {cell.drawer}
                  </span>
                  <div className="flex flex-wrap items-end gap-2" data-front-inner-editor={cell.index}>
                    <label className="grid gap-0.5">
                      <span className="text-graphiteMw">Внутренние ящики за фасадом: зоны, мм сверху вниз</span>
                      <input
                        className="mw-field mw-num w-[12ch] px-2"
                        placeholder="нет · например 100, 100"
                        defaultValue={cell.inners.map((inner) => inner.zoneMm).join(', ')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setInners(cell.index, (e.target as HTMLInputElement).value);
                        }}
                        onBlur={(e) => {
                          const now = cell.inners.map((inner) => inner.zoneMm).join(', ');
                          if (e.target.value.trim() !== now) setInners(cell.index, e.target.value);
                        }}
                        data-front-inners={cell.index}
                      />
                    </label>
                    <label className="grid gap-0.5">
                      <span className="text-graphiteMw">Вставка в ящик</span>
                      <select
                        className="mw-field mw-touch px-2"
                        value={cell.insert?.kind ?? ''}
                        onChange={(e) => setInsert(cell.leaf, e.target.value, e.target.value === 'rails' ? undefined : (cell.insert?.sections ?? 4))}
                        data-front-insert={cell.index}
                      >
                        <option value="">Нет</option>
                        {Object.entries(DRAWER_INSERT_TITLE).map(([kind, title]) => (
                          <option key={kind} value={kind}>
                            {title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {cell.inners.map((inner, j) => (
                    <span key={inner.leaf} className={inner.ready ? 'text-graphiteMw' : 'text-alert'} data-front-inner={inner.leaf}>
                      Внутренний ящик {j + 1}: зона {inner.zoneMm} мм · {inner.drawer} · открывается, когда открыт фасад {cell.index + 1}
                    </span>
                  ))}
                  {cell.insert && (
                    <span className="text-graphiteMw" data-front-insert-words={cell.index}>
                      {cell.insert.words}
                    </span>
                  )}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className="mw-btn mw-touch px-3" onClick={() => apply(evenDrawerFronts(rowsCount, totalMm))} data-drawer-fronts-even>
          Равномерно
        </button>
        <label className="grid gap-1 text-[13px]">
          <span className="text-graphiteMw">Доли рядов, сверху вниз</span>
          <input
            className="mw-field w-[12ch] px-2"
            placeholder={heights.map(() => '1').join(' : ')}
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            data-drawer-fronts-shares
          />
        </label>
        <button
          type="button"
          className="mw-btn mw-touch px-3"
          disabled={shareList.length === 0}
          onClick={() =>
            apply(
              shareList.length === rowsCount
                ? proportionalDrawerFronts(shareList, totalMm)
                : { refusal: `Долей ${shareList.length}, а рядов ${rowsCount} — по доле на ряд.` },
            )
          }
          data-drawer-fronts-proportional
        >
          Пропорционально
        </button>
      </div>
      {canSplit && (
        <div className="grid gap-1 text-[13px]" data-drawer-split-editor>
          <span className="text-graphiteMw">
            Столбцы: перегородка от крыши на высоту выбранных рядов; ниже ряд на всю ширину — перемычка под ними. Присадка
            перегородки и перемычки цехом не задана — «не рассчитана».
          </span>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1">
              <span className="text-graphiteMw">Левый столбец, мм (до оси перегородки)</span>
              <input
                className="mw-field mw-num w-[8ch] px-2"
                inputMode="numeric"
                value={left}
                onChange={(e) => setLeft(e.target.value)}
                data-drawer-split-left
              />
            </label>
            <button type="button" className="mw-btn mw-touch px-2" onClick={() => setLeft(String(Math.round(unit.widthMm / 2)))}>
              Поровну
            </button>
            <select
              className="mw-field mw-touch px-2"
              value={split?.rows ?? 0}
              onChange={(e) => applySplit(Number(e.target.value))}
              aria-label="Какие ряды разделить на два столбца"
              data-drawer-split-rows
            >
              <option value={0}>Без деления</option>
              {heights.map((_, i) =>
                i + 1 === rowsCount ? (
                  <option key={i} value={i + 1}>
                    Все ряды — два столбца
                  </option>
                ) : (
                  <option key={i} value={i + 1}>
                    {i === 0 ? 'Верхний ряд' : `Верхние ${i + 1} ряда`} — два столбца, ниже на всю ширину
                  </option>
                ),
              )}
            </select>
            {split && (
              <button type="button" className="mw-btn mw-touch px-2" onClick={() => applySplit(split.rows)} data-drawer-split-apply>
                Применить ширину
              </button>
            )}
          </div>
        </div>
      )}
      {notice && (
        <p className="text-[13px] leading-snug text-alert" role="alert" data-drawer-fronts-notice>
          {notice}
        </p>
      )}
    </section>
  );
}
