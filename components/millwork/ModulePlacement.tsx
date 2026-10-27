'use client';

import { useEffect, useState } from 'react';
import type { RunRow } from '@/lib/millwork/selection';
import type { Module, Run } from '@/types/millwork';

/**
 * МЕСТО МОДУЛЯ — ЧИСЛОМ, ВПЛОТНУЮ, НА ДРУГУЮ СТЕНУ (Measurement 2.0).
 *
 * Мебельщик ставит шкаф «в 350 мм от угла» или «вплотную к мойке» — не
 * мышью наугад шагом 50 мм. Здесь три вещи:
 *
 *   от левого угла стены, мм — точная отметка; меряется от угла стены
 *                              (`startOnWallMm` — где на стене начинается
 *                              ряд), как рулеткой;
 *   прижать                  — к соседу или к краю ряда: отметка соседа,
 *                              а не сетки шага;
 *   на другую стену          — модуль целиком, с предпросмотром: что
 *                              получится на обеих стенах и итог.
 *
 * Ничего не двигается само: отметку ставит человек, а движок отказывает
 * словами с миллиметрами, если там занято или модуль вышел бы за ряд.
 * Точное место — только у нижнего ряда свободной сборки: в готовом
 * решении модули стоят по раскладке, висящие ряды — по участкам между
 * окнами; это сказано словами, а не кнопкой, которая ничего не делает.
 */

export type TransferPreview = {
  /** Не встаёт — словами с мм. */
  refusal: string | null;
  /** Что изменится — словами. */
  lines: string[];
  totalBefore: number | null;
  totalAfter: number | null;
  /**
   * Что экран запрёт после переноса — словами экрана (ход у угла, дверь
   * витрины). Не пусто — цены после записи не будет, и это сказано до нажатия.
   */
  blocked: string[];
  /** Записать то, что показано. */
  commit: () => void;
};

type Props = {
  unit: Module;
  row: RunRow;
  run: Run;
  /** «Стена Б». */
  wallName: string;
  /** Где на стене начинается ряд, мм — отсюда считается «от левого угла». */
  startOnWallMm: number;
  freeMode: boolean;
  /** Другие стены кухни — куда переносить. */
  walls: { index: number; name: string; startOnWallMm: number; lengthMm: number }[];
  onMove: (offsetMm: number) => void;
  transferPreview: (toIndex: number, fromLeftMm: number) => TransferPreview;
};

function money(value: number | null): string {
  return value === null ? 'цены нет' : `${Math.round(value).toLocaleString('ru-RU')} ₸`;
}

export default function ModulePlacement({ unit, row, run, wallName, startOnWallMm, freeMode, walls, onMove, transferPreview }: Props) {
  const fromLeft = startOnWallMm + unit.offsetMm;
  const [draft, setDraft] = useState(String(fromLeft));
  const [target, setTarget] = useState<number | null>(walls[0]?.index ?? null);
  const [targetFrom, setTargetFrom] = useState('');
  const [pending, setPending] = useState<TransferPreview | null>(null);

  /* Поле после правки показывает число ряда, а не набранное (ловушка 628). */
  useEffect(() => {
    setDraft(String(startOnWallMm + unit.offsetMm));
    setPending(null);
  }, [unit.id, unit.offsetMm, startOnWallMm]);

  const exact = freeMode && row === 'base';
  const others = run.modules.filter((item) => item.id !== unit.id);
  const leftEnd = others.filter((item) => item.offsetMm + item.widthMm <= unit.offsetMm).reduce<Module | null>(
    (best, item) => (!best || item.offsetMm + item.widthMm > best.offsetMm + best.widthMm ? item : best),
    null,
  );
  const rightStart = others.filter((item) => item.offsetMm >= unit.offsetMm + unit.widthMm).reduce<Module | null>(
    (best, item) => (!best || item.offsetMm < best.offsetMm ? item : best),
    null,
  );
  const leftTo = leftEnd ? leftEnd.offsetMm + leftEnd.widthMm : 0;
  const rightTo = (rightStart ? rightStart.offsetMm : run.lengthMm) - unit.widthMm;
  const gapLeft = unit.offsetMm - leftTo;
  const gapRight = rightTo - unit.offsetMm;

  return (
    <section className="mt-3 grid gap-2 text-[13px]" data-module-placement={unit.id}>
      <p className="mw-label">Место модуля · {wallName}</p>
      {exact ? (
        <>
          <label className="flex flex-wrap items-center gap-2">
            <span>От левого угла стены</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              data-placement-from={unit.id}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              }}
              className="mw-num mw-touch w-24 rounded-[var(--r-control)] bg-surface2 px-2 text-[15px]"
            />
            <span className="text-graphiteMw">мм</span>
            <button
              type="button"
              data-placement-set
              className="mw-btn mw-btn-ghost"
              disabled={!Number.isInteger(Number(draft)) || Number(draft) === fromLeft}
              onClick={() => onMove(Number(draft) - startOnWallMm)}
            >
              Поставить
            </button>
          </label>
          <p className="leading-snug text-graphiteMw" data-placement-gaps={`${gapLeft},${gapRight}`}>
            Слева пусто {gapLeft} мм{leftEnd ? ` (до «${leftEnd.label}»)` : ' (до начала ряда)'}, справа — {gapRight} мм
            {rightStart ? ` (до «${rightStart.label}»)` : ' (до конца ряда)'}.
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              data-placement-snap="left"
              disabled={gapLeft === 0}
              className="mw-btn mw-btn-ghost"
              onClick={() => onMove(leftTo)}
            >
              Прижать {leftEnd ? `к «${leftEnd.label}»` : 'к началу ряда'} · {startOnWallMm + leftTo} мм
            </button>
            <button
              type="button"
              data-placement-snap="right"
              disabled={gapRight === 0}
              className="mw-btn mw-btn-ghost"
              onClick={() => onMove(rightTo)}
            >
              Прижать {rightStart ? `к «${rightStart.label}»` : 'к концу ряда'} · {startOnWallMm + rightTo} мм
            </button>
          </div>
        </>
      ) : (
        <p className="leading-snug text-graphiteMw" data-placement-why>
          {freeMode
            ? 'Точное место числом — у нижнего ряда: верхний ряд и антресоль стоят участками между окнами и выступами, их переставляют местами на схеме.'
            : 'В готовом решении модули стоят по раскладке вплотную: точное место числом и перенос шкафа на другую стену — в свободной сборке («Собрать самому»). Прибор переносится на другую стену выше — «Прибор стоит на стене».'}
          {' '}Сейчас: {fromLeft} мм от левого угла стены.
        </p>
      )}

      {freeMode && walls.length > 0 && (
        <div className="grid gap-1 border-t border-blueprint/20 pt-2" data-placement-transfer>
          <span>Перенести на другую стену</span>
          <div className="flex flex-wrap items-center gap-1">
            {walls.map((item) => (
              <button
                key={item.index}
                type="button"
                data-placement-wall={item.index}
                aria-pressed={target === item.index}
                className={`mw-btn ${target === item.index ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                onClick={() => {
                  setTarget(item.index);
                  setPending(null);
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
          <label className="flex flex-wrap items-center gap-2">
            <span>от её левого угла</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              data-placement-target-from
              value={targetFrom}
              placeholder={target !== null ? String(walls.find((item) => item.index === target)?.startOnWallMm ?? 0) : ''}
              onChange={(event) => {
                setTargetFrom(event.target.value);
                setPending(null);
              }}
              className="mw-num mw-touch w-24 rounded-[var(--r-control)] bg-surface2 px-2 text-[15px]"
            />
            <span className="text-graphiteMw">мм</span>
            <button
              type="button"
              data-placement-transfer-preview
              disabled={target === null}
              className="mw-btn mw-btn-ghost"
              onClick={() => {
                if (target === null) return;
                const wall = walls.find((item) => item.index === target);
                const at = targetFrom.trim() === '' ? (wall?.startOnWallMm ?? 0) : Number(targetFrom);
                setPending(transferPreview(target, at));
              }}
            >
              Показать, что получится
            </button>
          </label>
          {pending && (
            <div className="grid gap-1 border border-cyanBright bg-sheet p-2" data-placement-transfer-result>
              {pending.refusal ? (
                <p className="text-alert" data-placement-transfer-refusal>
                  {pending.refusal}
                </p>
              ) : (
                <>
                  <ul className="grid gap-0.5 leading-snug">
                    <li>
                      Итог: {money(pending.totalBefore)} → {pending.blocked.length > 0 ? 'цены не будет' : money(pending.totalAfter)}
                    </li>
                    {pending.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {pending.blocked.map((words) => (
                      <li key={words} className="text-alert" data-placement-transfer-blocked>
                        После переноса цены не будет: {words}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      data-placement-transfer-apply
                      className="mw-btn mw-btn-primary"
                      onClick={() => {
                        pending.commit();
                        setPending(null);
                      }}
                    >
                      Применить
                    </button>
                    <button type="button" className="mw-btn mw-btn-ghost" onClick={() => setPending(null)}>
                      Отмена
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
