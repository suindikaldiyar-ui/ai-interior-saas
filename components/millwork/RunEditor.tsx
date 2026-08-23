'use client';

import { useEffect, useState } from 'react';
import {
  APPLIANCE_SLOTS,
  MAX_WIDTH,
  MIN_WIDTH,
  STANDARD_WIDTHS,
  isStandardWidth,
} from '@/lib/millwork/modules';
import { widthOverflowMm } from '@/lib/millwork/invariants';
import { freeSpaceMm } from '@/lib/millwork/layout';
import type { ApplianceKind, MillworkOp, Module, Run } from '@/types/millwork';

/**
 * Лента модулей ровно над чертежом и совпадающая с ним по ширине:
 * это тот же ряд, вид спереди. Клик по типу подсвечивает модуль на чертеже
 * и наоборот — ручное и текстовое редактирование работают с одним списком,
 * поэтому не конфликтуют.
 */

type Props = {
  run: Run;
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
  onOps: (ops: MillworkOp[]) => void;
};

const APPLIANCE_OPTIONS: (ApplianceKind | '')[] = [
  '',
  'sink600',
  'sink800',
  'hob',
  'oven',
  'dishwasher45',
  'dishwasher60',
  'fridge',
  'microwave',
  'hood',
];

export default function RunEditor({ run, selectedModuleId, onSelect, onOps }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const free = freeSpaceMm(run);
  const selected = run.modules.find((m) => m.id === selectedModuleId) ?? null;

  /*
   * Ширина вводится числом: корпусную мебель делают на заказ, и сама
   * раскладка выдаёт модули вроде 630 мм — из списка стандартов такое
   * не наберёшь. Стандарты остаются чипами быстрого выбора.
   */
  const [widthDraft, setWidthDraft] = useState('');
  const [widthNote, setWidthNote] = useState<string | null>(null);

  const selectedWidth = selected?.widthMm ?? 0;
  useEffect(() => {
    setWidthDraft(selectedWidth ? String(selectedWidth) : '');
    setWidthNote(null);
  }, [selectedModuleId, selectedWidth]);

  const commitWidth = (raw: number) => {
    if (!selected || selected.appliance) return;

    const wanted = Math.round(raw);
    if (!Number.isFinite(wanted) || wanted < MIN_WIDTH || wanted > MAX_WIDTH) {
      setWidthNote(`Ширина модуля — от ${MIN_WIDTH} до ${MAX_WIDTH} мм.`);
      setWidthDraft(String(selected.widthMm));
      return;
    }

    // Инвариант проверяется ДО применения: отрицательного остатка
    // и вылезшего за стену ряда пользователь видеть не должен.
    const over = widthOverflowMm(run, selected.id, wanted, MIN_WIDTH);
    if (over > 0) {
      setWidthNote(`Не помещается: ряд вышел бы за стену на ${over} мм.`);
      setWidthDraft(String(selected.widthMm));
      return;
    }

    setWidthNote(null);
    if (wanted !== selected.widthMm) {
      onOps([{ op: 'set_width', moduleId: selected.id, widthMm: wanted }]);
    }
  };

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    onOps([{ op: 'move_module', moduleId: dragId, afterModuleId: targetId }]);
    setDragId(null);
  };

  // Подпись приходит из раскладки: она описывает содержание модуля,
  // а не его ширину — 900 мм это двухдверный модуль, а не «дверца 900».
  const label = (unit: Module) =>
    unit.appliance ? APPLIANCE_SLOTS[unit.appliance].title : unit.label;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[15px] font-medium">Состав ряда</span>
        <span
          className="mw-num text-[13px]"
          style={{ color: free === 0 ? 'var(--graphite-mw)' : 'var(--alert)' }}
        >
          {free === 0 ? 'место занято полностью' : `осталось ${free} мм`}
        </span>
      </div>

      {/*
        * Ширина ленты пропорциональна модулям — она совпадает с чертежом.
        * На телефоне пропорция сохраняется, а лента прокручивается вбок:
        * это единственное место, где горизонтальная прокрутка уместна.
        */}
      <div className="flex w-full gap-1 overflow-x-auto pb-1">
        {run.modules.map((unit) => {
          const active = unit.id === selectedModuleId;
          return (
            <button
              key={unit.id}
              type="button"
              draggable
              onDragStart={() => setDragId(unit.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(unit.id)}
              onClick={() => onSelect(active ? null : unit.id)}
              style={{ flexGrow: unit.widthMm, flexBasis: 0, minWidth: 76 }}
              className={`min-h-[72px] overflow-hidden rounded-[var(--r-control)] px-2 py-2 text-left ${
                active
                  ? 'bg-cyanBright text-navyDeep'
                  : unit.kind === 'filler'
                    ? 'bg-alert/20'
                    : 'bg-sheet hover:bg-navyLine/50'
              }`}
            >
              <span className="mw-num block text-[15px] font-medium leading-none">
                {unit.widthMm}
              </span>
              <span
                className={`mt-1 block truncate text-[13px] leading-tight ${
                  active ? 'text-navyDeep/80' : 'text-graphiteMw'
                }`}
              >
                {label(unit)}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mw-panel mt-3">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[15px] font-medium">Модуль {selected.widthMm} мм</span>
            <button
              type="button"
              onClick={() => onOps([{ op: 'remove_module', moduleId: selected.id }])}
              className="mw-btn mw-btn-ghost text-alert"
            >
              Удалить
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="col-span-2 block">
              <span className="mw-label">Ширина, мм</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_WIDTH}
                max={MAX_WIDTH}
                step={1}
                value={widthDraft}
                disabled={Boolean(selected.appliance)}
                onChange={(e) => setWidthDraft(e.target.value)}
                onBlur={(e) => commitWidth(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="mw-num mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px] disabled:opacity-40"
              />

              {selected.appliance ? (
                <span className="mt-1 block text-[13px] leading-tight text-graphiteMw">
                  {selected.widthMm} — ширина прибора «
                  {APPLIANCE_SLOTS[selected.appliance].title}»
                </span>
              ) : (
                <>
                  <span className="mt-1 flex flex-wrap gap-[3px]">
                    {STANDARD_WIDTHS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          setWidthDraft(String(w));
                          commitWidth(w);
                        }}
                        className={`mw-num border px-1 py-[2px] text-[13px] ${
                          selected.widthMm === w
                            ? 'mw-btn-primary'
                            : 'border-blueprint/30 text-blueprint hover:border-blueprint'
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </span>

                  {widthNote ? (
                    <span className="mt-1 block text-[13px] leading-tight text-alert">
                      {widthNote}
                    </span>
                  ) : (
                    !isStandardWidth(selected.widthMm) && (
                      // Спокойная подпись, а не ошибка: мебель делают на заказ.
                      <span className="mt-1 block text-[13px] leading-tight text-graphiteMw">
                        Нестандартный модуль — изготавливается по размеру.
                      </span>
                    )
                  )}
                </>
              )}
            </label>

            <label className="block">
              <span className="mw-label">Фасад</span>
              <select
                value={selected.frontType === 'drawers' ? selected.drawerCount : 0}
                disabled={Boolean(selected.appliance)}
                onChange={(e) =>
                  onOps([
                    { op: 'set_fronts', moduleId: selected.id, drawerCount: Number(e.target.value) },
                  ])
                }
                className="mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px] disabled:opacity-40"
              >
                <option value={0}>Дверца</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} ящика
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mw-label">Тип</span>
              <select
                value={selected.kind}
                onChange={(e) =>
                  onOps([
                    {
                      op: 'replace_module',
                      moduleId: selected.id,
                      kind: e.target.value as Module['kind'],
                      appliance: selected.appliance,
                    },
                  ])
                }
                className="mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px]"
              >
                <option value="base">Нижний</option>
                <option value="tall">Пенал</option>
                <option value="corner_base">Угловой</option>
              </select>
            </label>

            <label className="block">
              <span className="mw-label">Техника</span>
              <select
                value={selected.appliance ?? ''}
                onChange={(e) => {
                  const value = e.target.value as ApplianceKind | '';
                  onOps([
                    {
                      op: 'replace_module',
                      moduleId: selected.id,
                      kind: value ? APPLIANCE_SLOTS[value].kind : 'base',
                      appliance: value || undefined,
                    },
                  ]);
                }}
                className="mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px]"
              >
                {APPLIANCE_OPTIONS.map((a) => (
                  <option key={a || 'none'} value={a}>
                    {a ? APPLIANCE_SLOTS[a].title : 'Нет'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() =>
            onOps([
              {
                op: 'add_module',
                kind: 'base',
                widthMm: 600,
                afterModuleId: selectedModuleId ?? undefined,
              },
            ])
          }
          className="mw-btn mw-btn-ghost"
        >
          + Модуль
        </button>
        <button
          type="button"
          onClick={() => onOps([{ op: 'add_module', kind: 'tall', widthMm: 600 }])}
          className="mw-btn mw-btn-ghost"
        >
          + Пенал
        </button>
      </div>
    </div>
  );
}
