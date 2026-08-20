'use client';

import { useState } from 'react';
import { APPLIANCE_SLOTS, STANDARD_WIDTHS } from '@/lib/millwork/modules';
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

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    onOps([{ op: 'move_module', moduleId: dragId, afterModuleId: targetId }]);
    setDragId(null);
  };

  const label = (unit: Module) =>
    unit.appliance
      ? APPLIANCE_SLOTS[unit.appliance].title
      : unit.kind === 'tall'
        ? 'Пенал'
        : unit.frontType === 'drawers'
          ? `${unit.drawerCount} ящика`
          : 'Дверца';

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="mw-label">Состав ряда</span>
        <span className="mw-num text-[11px]" style={{ color: free === 0 ? 'var(--graphite-mw)' : 'var(--alert)' }}>
          {free === 0 ? 'место занято полностью' : `осталось ${free} мм`}
        </span>
      </div>

      {/* Ширина ленты пропорциональна модулям — она совпадает с чертежом */}
      <div className="flex w-full gap-[2px]">
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
              style={{ flexGrow: unit.widthMm, flexBasis: 0 }}
              className={`mw-touch overflow-hidden border px-1 py-1.5 text-left ${
                active
                  ? 'border-blueprint bg-tape/35'
                  : unit.isFiller
                    ? 'border-alert bg-sheet'
                    : 'border-blueprint/40 bg-sheet hover:border-blueprint'
              }`}
            >
              <span className="mw-num block text-[10px] leading-none">{unit.widthMm}</span>
              <span className="block truncate text-[9px] leading-tight text-graphiteMw">
                {label(unit)}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-2 border border-blueprint/40 bg-sheet p-2">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="mw-label">Модуль {selected.widthMm} мм</span>
            <button
              type="button"
              onClick={() => onOps([{ op: 'remove_module', moduleId: selected.id }])}
              className="mw-touch border border-alert px-2 text-[11px] uppercase tracking-[0.1em] text-alert"
            >
              Удалить
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="mw-label">Ширина</span>
              <select
                value={selected.appliance ? '' : selected.widthMm}
                disabled={Boolean(selected.appliance)}
                onChange={(e) =>
                  onOps([{ op: 'set_width', moduleId: selected.id, widthMm: Number(e.target.value) }])
                }
                className="mw-num mw-touch mt-1 w-full border border-blueprint/40 bg-white px-1.5 text-[12px] disabled:opacity-40"
              >
                {selected.appliance && <option value="">{selected.widthMm} (техника)</option>}
                {STANDARD_WIDTHS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
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
                className="mw-touch mt-1 w-full border border-blueprint/40 bg-white px-1.5 text-[12px] disabled:opacity-40"
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
                className="mw-touch mt-1 w-full border border-blueprint/40 bg-white px-1.5 text-[12px]"
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
                className="mw-touch mt-1 w-full border border-blueprint/40 bg-white px-1.5 text-[12px]"
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
          className="mw-touch border border-blueprint px-2 text-[11px] uppercase tracking-[0.1em] text-blueprint"
        >
          + Модуль
        </button>
        <button
          type="button"
          onClick={() => onOps([{ op: 'add_module', kind: 'tall', widthMm: 600 }])}
          className="mw-touch border border-blueprint px-2 text-[11px] uppercase tracking-[0.1em] text-blueprint"
        >
          + Пенал
        </button>
      </div>
    </div>
  );
}
