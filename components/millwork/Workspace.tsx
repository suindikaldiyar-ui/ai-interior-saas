'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import CommandBar from './CommandBar';
import DrawingSheet from './DrawingSheet';
import ElevationDrawing from './ElevationDrawing';
import EstimateTable from './EstimateTable';
import PlanDrawing from './PlanDrawing';
import RunEditor from './RunEditor';
import VariantTabs from './VariantTabs';
import { buildEstimate, recalcTotal, type RateTable } from '@/lib/millwork/estimate';
import { applyOps } from '@/lib/millwork/ops';
import { buildVariants } from '@/lib/millwork/variants';
import { validateRun } from '@/lib/millwork/validate';
import type {
  CommPoint,
  MillworkOp,
  Opening,
  Run,
  RunRequirements,
  VariantKey,
} from '@/types/millwork';

/**
 * Рабочее место замерщика: планшет альбомный, клиент смотрит в тот же экран.
 *
 * Сверху цены трёх вариантов, под ними лента модулей, ровно под лентой —
 * чертёж той же ширины, справа смета, снизу командная строка под большой палец.
 */

type Tab = 'facade' | 'plan' | 'render';

export type WorkspaceProps = {
  title: string;
  zone: string;
  measuredBy: string;
  measuredAt: string;
  lengthMm: number;
  ceilingHeightMm: number;
  requirements: RunRequirements;
  openings: Opening[];
  comms: CommPoint[];
  rates: RateTable;
  cornerAt?: 'start' | 'end' | null;
};

export default function Workspace(props: WorkspaceProps) {
  const [variantKey, setVariantKey] = useState<VariantKey>('optimal');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('facade');
  const [disabled, setDisabled] = useState<Record<VariantKey, string[]>>({
    basic: [],
    optimal: [],
    premium: [],
  });
  const [editedRuns, setEditedRuns] = useState<Partial<Record<VariantKey, Run>>>({});
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [changedIds, setChangedIds] = useState<string[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Три варианта — одна раскладка в трёх комплектациях.
  const baseVariants = useMemo(
    () =>
      buildVariants({
        lengthMm: props.lengthMm,
        ceilingHeightMm: props.ceilingHeightMm,
        requirements: props.requirements,
        openings: props.openings,
        comms: props.comms,
        rates: props.rates,
        cornerAt: props.cornerAt ?? null,
        disabledKeys: disabled,
      }),
    [props, disabled],
  );

  /*
   * Правки применяются к выбранному варианту: остальные два продолжают
   * показывать базовую комплектацию, иначе сравнивать станет нечего.
   */
  const variants = useMemo(
    () =>
      baseVariants.map((variant) => {
        const edited = editedRuns[variant.key];
        if (!edited) return variant;
        const estimate = recalcTotal(
          buildEstimate(edited, variant.key, props.rates, disabled[variant.key]),
          disabled[variant.key],
        );
        return { ...variant, run: edited, estimate };
      }),
    [baseVariants, editedRuns, props.rates, disabled],
  );

  const active = variants.find((v) => v.key === variantKey) ?? variants[0];
  const issues = useMemo(
    () => validateRun(active.run, props.comms),
    [active.run, props.comms],
  );

  const flash = useCallback((ids: string[]) => {
    setChangedIds(ids);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setChangedIds([]), 420);
  }, []);

  const runOps = useCallback(
    (ops: MillworkOp[]) => {
      if (ops.length === 0) return;
      const before = new Map(active.run.modules.map((m) => [m.id, m.widthMm]));
      const next = applyOps({
        run: active.run,
        requirements: props.requirements,
        ops,
        openings: props.openings,
      });
      setEditedRuns((prev) => ({ ...prev, [active.key]: next }));
      setSelectedId(null);
      flash(
        next.modules
          .filter((m) => before.get(m.id) !== m.widthMm)
          .map((m) => m.id),
      );
    },
    [active, props.requirements, props.openings, flash],
  );

  const sendCommand = useCallback(
    async (text: string) => {
      setBusy(true);
      setReply(null);
      try {
        const res = await fetch('/api/ai/millwork', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            run: active.run,
            requirements: props.requirements,
          }),
        });
        const data = await res.json();
        setReply(typeof data.reply === 'string' ? data.reply : null);
        if (Array.isArray(data.ops) && data.ops.length > 0) runOps(data.ops);
      } catch {
        setReply('Сервер не ответил. Правьте состав вручную.');
      } finally {
        setBusy(false);
      }
    },
    [active.run, props.requirements, runOps],
  );

  const toggleLine = (key: string) =>
    setDisabled((prev) => {
      const current = prev[variantKey];
      return {
        ...prev,
        [variantKey]: current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key],
      };
    });

  const errors = issues.filter((i) => i.level === 'error');

  return (
    <div className="mw-root flex h-screen flex-col overflow-hidden">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-blueprint/25 px-4 py-2 print:hidden">
        <span className="text-[15px] font-semibold tracking-[-0.02em]">InteriorAI Studio</span>
        <span className="text-[13px]">
          {props.title} · {props.zone}
        </span>
        <span className="mw-num ml-auto text-[11px] text-graphiteMw">
          {props.measuredBy} · {props.measuredAt}
        </span>
      </header>

      <div className="print:hidden">
        <VariantTabs variants={variants} active={active.key} onChange={setVariantKey} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
          <div className="print:hidden">
            <RunEditor
              run={active.run}
              selectedModuleId={selectedId}
              onSelect={setSelectedId}
              onOps={runOps}
            />
          </div>

          {errors.length > 0 && (
            <ul className="mt-2 border border-alert bg-sheet px-2 py-1.5 print:hidden">
              {errors.map((issue, i) => (
                <li key={i} className="text-[11px] leading-snug text-alert">
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex gap-1 print:hidden">
            {(
              [
                ['facade', 'Фасад'],
                ['plan', 'План'],
                ['render', 'Рендер'],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`mw-touch border px-3 text-[11px] uppercase tracking-[0.12em] ${
                  tab === key
                    ? 'border-blueprint bg-blueprint text-sheet'
                    : 'border-blueprint/30 text-blueprint'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <DrawingSheet
              title={props.title}
              zone={props.zone}
              measuredBy={props.measuredBy}
              measuredAt={props.measuredAt}
              variantTitle={active.title}
            >
              {tab === 'facade' && (
                <ElevationDrawing
                  run={active.run}
                  selectedModuleId={selectedId}
                  onSelect={setSelectedId}
                  changedIds={changedIds}
                />
              )}
              {tab === 'plan' && (
                <PlanDrawing
                  run={active.run}
                  comms={props.comms}
                  issues={issues}
                  selectedModuleId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
              {tab === 'render' && (
                <p className="px-6 py-10 text-center text-[12px] text-graphiteMw">
                  Фотореалистичная визуализация собирается в студии: там же
                  подставляются материалы каталога.
                </p>
              )}
            </DrawingSheet>
          </div>
        </section>

        <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-blueprint/25 bg-sheet lg:w-[340px] lg:border-l lg:border-t-0">
          <EstimateTable
            estimate={active.estimate}
            disabledKeys={disabled[active.key]}
            onToggle={toggleLine}
          />
          <div className="border-t border-blueprint/25 px-3 py-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="mw-touch w-full border border-blueprint bg-blueprint px-3 text-[11px] uppercase tracking-[0.1em] text-sheet"
            >
              Печать чертежа
            </button>
          </div>
        </aside>
      </div>

      <div className="print:hidden">
        <CommandBar onSubmit={sendCommand} busy={busy} lastReply={reply} />
      </div>
    </div>
  );
}
