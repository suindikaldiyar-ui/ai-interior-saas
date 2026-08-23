'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/millwork/estimate';
import {
  PROJECT_STATUSES,
  STATUS_LABEL,
  projectTitle,
  type ProjectRow,
  type ProjectStatus,
} from '@/lib/projects';
import { supabaseBrowser } from '@/lib/supabase/client';

type Row = Omit<ProjectRow, 'measurements' | 'millwork'>;

/**
 * Список объектов компании. Статус переключается вручную прямо в карточке:
 * менеджер ведёт воронку здесь же, не открывая объект.
 */
export default function ProjectList({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all');

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const map = new Map<ProjectStatus, number>();
    for (const row of rows) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [rows]);

  const setStatus = async (id: string, status: ProjectStatus) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    const supabase = supabaseBrowser();
    if (supabase) await supabase.from('projects').update({ status }).eq('id', id);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="Все"
          count={rows.length}
        />
        {PROJECT_STATUSES.map((status) => (
          <FilterChip
            key={status}
            active={filter === status}
            onClick={() => setFilter(status)}
            label={STATUS_LABEL[status]}
            count={counts.get(status) ?? 0}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="border border-dashed border-navyLine p-4 text-[13px] text-graphiteMw">
          {rows.length === 0
            ? 'Объектов пока нет. Начните с замера — конфигурация появится сразу после ввода стен.'
            : 'В этом статусе объектов нет.'}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((row) => (
          <article key={row.id} className="border border-navyLine bg-sheet">
            <Link href={`/project/${row.id}`} className="block px-3 pt-3">
              <h2 className="text-[15px] font-medium leading-tight">
                {projectTitle(row)}
              </h2>
              <p className="mt-0.5 text-[13px] text-graphiteMw">
                {row.zone}
                {row.client_name ? ` · ${row.client_name}` : ''}
              </p>
              <p className="mw-num mt-2 text-[13px] text-graphiteMw">
                {row.surveyor || '—'} · {row.updated_at.slice(0, 10)}
              </p>
              <p className="mw-num mt-1 text-[17px] font-semibold">
                {row.total > 0 ? `${formatMoney(row.total)} ₸` : '—'}
              </p>
            </Link>

            <label className="mt-2 block border-t border-navyLine px-3 py-2">
              <span className="mw-label">Статус</span>
              <select
                value={row.status}
                onChange={(e) => setStatus(row.id, e.target.value as ProjectStatus)}
                className="mw-field mt-2"
              >
                {PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`mw-touch border px-2.5 text-[13px] uppercase tracking-[0.1em] ${
        active
          ? 'border-cyanBright bg-cyanBright text-navyDeep'
          : 'border-navyLine text-graphiteMw hover:border-cyan hover:text-textMw'
      }`}
    >
      {label}
      <span className="mw-num ml-1.5 opacity-70">{count}</span>
    </button>
  );
}
