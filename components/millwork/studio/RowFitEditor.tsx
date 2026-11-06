'use client';

import { useMemo, useState } from 'react';
import { FIT_ROW_TITLE, rowFillPlan, rowFits, type FitRow, type RowFit } from '@/lib/millwork/rowFit';
import type { MillworkOp, Opening, Run, RunRequirements } from '@/types/millwork';

/**
 * МЕСТО РЯДОВ НА СТЕНЕ (FINAL KITCHEN, задача 1) — блок инспектора у выбранной стены.
 *
 * Стена Б начинается не с нуля: нижний, верхний и антресольный ряды отступают от соседа каждый на своё. Здесь это
 * числами: длина стены, занято углом, доступно, собрано, свободно. «Заполнить до границы» — операция `fill_row`, а что
 * она сделает, сказано до нажатия планом той же `rowFillPlan`; нельзя — причина числом.
 */
type Props = {
  run: Run;
  label: string;
  openings: Opening[];
  requirements: RunRequirements;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run & { warnings: string[] };
};

export default function RowFitEditor({ run, label, openings, requirements, onOps, preview }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const fits = useMemo(() => rowFits(run, openings, requirements), [run, openings, requirements]);
  return (
    <section className="mw-panel grid gap-3" data-row-fit={label}>
      <p className="text-[15px] font-medium">Место на стене: {label}</p>
      <p className="text-[13px] leading-snug text-graphiteMw" data-row-fit-wall>
        Длина стены {fits[0]?.wallMm ?? run.lengthMm} мм. У каждого ряда свой отступ у угла: он зависит от глубины ряда и вида стыка.
      </p>
      {fits.map((fit) => (
        <FitRowBlock key={fit.row} fit={fit} run={run} openings={openings} requirements={requirements} preview={preview} onOps={(ops) => onOps(ops, setNotice)} />
      ))}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-row-fit-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function FitRowBlock({
  fit,
  run,
  openings,
  requirements,
  preview,
  onOps,
}: {
  fit: RowFit;
  run: Run;
  openings: Opening[];
  requirements: RunRequirements;
  preview: Props['preview'];
  onOps: (ops: MillworkOp[]) => void;
}) {
  const plan = useMemo(() => rowFillPlan(run, fit.row, openings, requirements), [run, fit.row, openings, requirements]);
  const op: MillworkOp = { op: 'fill_row', row: fit.row as FitRow };
  /* Встанет ли — движок вхолостую: план говорит, что будет сделано, отказ — почему нет. */
  const attempt = useMemo(() => (plan.refusal ? null : preview([op])), [preview, plan.refusal, fit.row]); // eslint-disable-line react-hooks/exhaustive-deps
  const refusal = plan.refusal ?? attempt?.warnings[0] ?? null;
  const full = fit.free.length === 0;
  return (
    <div className="grid gap-1 rounded-[10px] bg-[var(--surface-2)] p-3" data-row-fit-row={fit.row} data-fit-free={fit.freeMm}>
      <p className="text-[14px] font-medium">{FIT_ROW_TITLE[fit.row]}</p>
      <p className="text-[13px] leading-snug" data-fit-numbers>
        занято углом {fit.startMm + fit.endMm} мм{fit.startMm > 0 && fit.endMm > 0 ? ` (${fit.startMm} + ${fit.endMm})` : ''} · доступно {fit.availableMm} мм ·
        собрано {fit.builtMm} мм · свободно {fit.freeMm} мм
      </p>
      {full ? (
        <p className="text-[13px] leading-snug text-graphiteMw">Ряд занимает всё доступное место.</p>
      ) : (
        <>
          <p className={`text-[13px] leading-snug ${refusal ? 'text-alert' : 'text-graphiteMw'}`} data-fit-plan>
            {refusal ?? `Будет: ${plan.words}.`}
          </p>
          <button
            type="button"
            className="mw-btn mw-btn-ghost"
            data-fit-fill={fit.row}
            disabled={Boolean(refusal)}
            onClick={() => onOps([op])}
          >
            Заполнить ряд до доступной границы
          </button>
        </>
      )}
    </div>
  );
}
