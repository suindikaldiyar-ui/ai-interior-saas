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
import type {
  ApplianceKind,
  FridgeType,
  MillworkOp,
  Module,
  Run,
  RunRequirements,
} from '@/types/millwork';

/**
 * Правка СОСТАВА, а не раскладки.
 *
 * Техника, колонна, встройка и верхний ряд меняют требования к ряду, и ряд
 * пересобирается целиком через `buildRun`. Операциями это делать нельзя:
 * операция правит модуль, а здесь меняется то, из чего модули считаются.
 */
export type CompositionPatch = {
  appliances?: ApplianceKind[];
  /** С какой стороны стоят пеналы: этим отличаются компоновки. */
  tallSide?: 'left' | 'right';
  columnTop?: 'microwave' | 'oven';
  fridgeType?: FridgeType;
  glassDisplay?: boolean;
  upperToCeiling?: boolean;
};

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
  /** Требования, по которым собран ряд: из них видно состав техники. */
  requirements?: RunRequirements;
  /** Правка состава. Без неё панель только читается. */
  onComposition?: (patch: CompositionPatch) => void;
};

/**
 * Техника, которую замерщик добавляет и убирает сам.
 *
 * Микроволновку мебельщик ставит почти в каждый заказ, а конфигуратор её
 * не предлагал вовсе. В умолчания она при этом не идёт: набор техники —
 * это разговор с клиентом, а не наша догадка.
 */
const ADDABLE: ApplianceKind[] = [
  'fridge',
  'oven',
  'microwave',
  'hob',
  'hood',
  'sink600',
  'sink800',
  'dishwasher45',
  'dishwasher60',
];

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

export default function RunEditor({
  run,
  selectedModuleId,
  onSelect,
  onOps,
  requirements,
  onComposition,
}: Props) {
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
  // У колонны приборов два, и назвать её одним из них значит соврать.
  const label = (unit: Module) =>
    unit.column || !unit.appliance ? unit.label : APPLIANCE_SLOTS[unit.appliance].title;

  const wanted = new Set(requirements?.appliances ?? []);
  const toggleAppliance = (appliance: ApplianceKind) => {
    if (!onComposition || !requirements) return;
    const next = wanted.has(appliance)
      ? requirements.appliances.filter((a) => a !== appliance)
      : [...requirements.appliances, appliance];
    onComposition({ appliances: next });
  };

  const upperToCeiling = Boolean(run.options.upperToCeiling);

  return (
    <div>
      {/*
        * Техника и верхний ряд — это СОСТАВ, и он стоит над лентой модулей:
        * сначала решают, что в кухне есть, потом двигают модули.
        */}
      {requirements && onComposition && (
        <div className="mw-panel mb-3">
          <span className="mw-label">Техника</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {ADDABLE.map((appliance) => {
              const on = wanted.has(appliance);
              return (
                <button
                  key={appliance}
                  type="button"
                  onClick={() => toggleAppliance(appliance)}
                  aria-pressed={on}
                  className={`mw-btn ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  {APPLIANCE_SLOTS[appliance].title}
                </button>
              );
            })}
          </div>

          {wanted.has('oven') && wanted.has('microwave') && (
            <p className="mt-2 text-[13px] leading-snug text-graphiteMw">
              Духовка и микроволновка встают в одну колонну 600 мм — так их
              и ставят, двумя пеналами это лишние 600 мм стены.
            </p>
          )}

          {/*
            * Верхний ряд до потолка просит примерно каждый второй клиент,
            * поэтому это выбор на виду, а не опция в глубине.
            */}
          {run.options.hasUpper && (
            <div className="mt-3">
              <span className="mw-label">Верхний ряд</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {(
                  [
                    [false, 'Стандартный'],
                    [true, 'До потолка'],
                  ] as [boolean, string][]
                ).map(([value, title]) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => onComposition({ upperToCeiling: value })}
                    aria-pressed={upperToCeiling === value}
                    className={`mw-btn ${upperToCeiling === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            <span className="mw-label">Дополнительно</span>
            <div className="mt-1 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => onComposition({ glassDisplay: !requirements.glassDisplay })}
                aria-pressed={Boolean(requirements.glassDisplay)}
                className={`mw-btn ${requirements.glassDisplay ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
              >
                Витрина с подсветкой
              </button>
            </div>
          </div>
        </div>
      )}

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

          {/*
            * Колонна: верх и низ меняются местами одной кнопкой. По
            * умолчанию микроволновка сверху — так ей пользуются, не
            * приседая; но у половины заказов наоборот.
            */}
          {selected.column && onComposition && (
            <div className="mb-3">
              <span className="mw-label">Колонна</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-graphiteMw">
                  Сверху {APPLIANCE_SLOTS[selected.column.top as ApplianceKind].title.toLowerCase()},
                  снизу {APPLIANCE_SLOTS[selected.column.bottom as ApplianceKind].title.toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onComposition({
                      columnTop: selected.column?.top === 'oven' ? 'microwave' : 'oven',
                    })
                  }
                  className="mw-btn mw-btn-ghost"
                >
                  Поменять местами
                </button>
              </div>
            </div>
          )}

          {/*
            * Встроенный холодильник закрыт фасадом, отдельностоящий стоит
            * на виду. Разница в цене заметная, поэтому это выбор, а не
            * умолчание в коде.
            */}
          {selected.appliance === 'fridge' && onComposition && (
            <div className="mb-3">
              <span className="mw-label">Холодильник</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {(
                  [
                    ['built_in', 'Встроенный'],
                    ['freestanding', 'Отдельностоящий'],
                  ] as [FridgeType, string][]
                ).map(([value, label]) => {
                  const on = (selected.builtIn ? 'built_in' : 'freestanding') === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onComposition({ fridgeType: value })}
                      aria-pressed={on}
                      className={`mw-btn ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
                {selected.builtIn
                  ? 'Закрыт фасадом заподлицо: фасад и петли для встройки в смете.'
                  : 'Стоит на виду: фасада на этот модуль в смете нет.'}
              </p>
            </div>
          )}

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
