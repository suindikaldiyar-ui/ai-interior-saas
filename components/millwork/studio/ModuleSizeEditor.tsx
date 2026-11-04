'use client';

import { useState } from 'react';
import { moduleCarcassHeightMm, moduleDepthMm } from '@/lib/millwork/fill';
import { moduleAppliances } from '@/lib/millwork/modules';
import type { MillworkOp, Module, Run } from '@/types/millwork';

/**
 * РАЗМЕРЫ МОДУЛЯ (FINAL FURNITURE EDITOR, общий редактор размеров) — блок инспектора у выбранного модуля.
 *
 * Ширина — `set_width`, высота корпуса — `set_height` и глубина — `set_module_depth` (высокий модуль; у нижнего
 * глубина ряда — столешница одна, у верхнего — отметки объекта). Ввод числом в мм и кнопками ±10; встанет ли — движок
 * вхолостую, его отказ виден до нажатия. Своих чисел здесь нет: «сейчас» — те же функции, что у раскроя и сцены.
 */
type Props = {
  unit: Module;
  run: Run;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run & { warnings: string[] };
};

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

export default function ModuleSizeEditor({ unit, run, onOps, preview }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const send = (ops: MillworkOp[]) => onOps(ops, (text) => setNotice(text));
  const carcass = moduleCarcassHeightMm(unit, run);
  const depth = moduleDepthMm(unit, run.zone, run.production);
  const fixedWidth = moduleAppliances(unit).length > 0;
  const rows: { key: 'width' | 'height' | 'depth'; title: string; now: number; why: string | null; op: (v: number) => MillworkOp; reset: MillworkOp | null }[] = [
    {
      key: 'width',
      title: 'Ширина',
      now: unit.widthMm,
      why: fixedWidth ? 'ширину модуля с техникой диктует прибор' : null,
      op: (v) => ({ op: 'set_width', moduleId: unit.id, widthMm: v }),
      reset: null,
    },
    {
      key: 'height',
      title: 'Высота корпуса',
      now: carcass,
      why: unit.kind === 'tall' ? null : unit.kind === 'upper' ? 'у верхнего ряда высоту задают отметки объекта' : 'у нижнего шкафа высоту задаёт рабочая поверхность',
      op: (v) => ({ op: 'set_height', moduleId: unit.id, heightMm: v }),
      reset: unit.heightMm !== undefined ? { op: 'set_height', moduleId: unit.id, heightMm: null } : null,
    },
    {
      key: 'depth',
      title: 'Глубина',
      now: depth,
      why: unit.kind === 'tall' ? null : unit.kind === 'upper' ? 'у верхнего ряда глубину задают отметки объекта' : 'у нижнего шкафа глубина ряда: столешница над рядом одна',
      op: (v) => ({ op: 'set_module_depth', moduleId: unit.id, depthMm: v }),
      reset: unit.ownDepthMm !== undefined ? { op: 'set_module_depth', moduleId: unit.id, depthMm: null } : null,
    },
  ];

  return (
    <section className="mw-panel grid gap-3" data-module-size={unit.id} data-module-size-now={`${unit.widthMm}x${carcass}x${depth}`}>
      <p className="text-[15px] font-medium">Размеры модуля</p>
      {rows.map((row) => (
        <SizeRow key={row.key} row={row} send={send} preview={preview} />
      ))}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-module-size-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function SizeRow({
  row,
  send,
  preview,
}: {
  row: { key: string; title: string; now: number; why: string | null; op: (v: number) => MillworkOp; reset: MillworkOp | null };
  send: (ops: MillworkOp[]) => void;
  preview: Props['preview'];
}) {
  const [text, setText] = useState(String(row.now));
  const value = num(text);
  const changed = value !== undefined && value !== row.now;
  const refusal = row.why ?? (changed ? (preview([row.op(value!)]).warnings[0] ?? null) : null);
  const step = (delta: number) => setText(String((value ?? row.now) + delta));
  return (
    <div className="grid gap-1" data-module-size-row={row.key}>
      <span className="text-[13px] text-graphiteMw">
        {row.title}, мм · сейчас <span className="mw-num">{row.now}</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="mw-btn min-h-[44px] min-w-[52px] px-2" data-module-size-minus={row.key} disabled={Boolean(row.why)} onClick={() => step(-10)}>
          −10
        </button>
        <input
          className="mw-field mw-num w-[110px]"
          inputMode="numeric"
          data-module-size-field={row.key}
          value={text}
          disabled={Boolean(row.why)}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="mw-btn min-h-[44px] min-w-[52px] px-2" data-module-size-plus={row.key} disabled={Boolean(row.why)} onClick={() => step(10)}>
          +10
        </button>
        <button
          type="button"
          className="mw-btn min-h-[44px] px-3"
          data-module-size-apply={row.key}
          disabled={!changed || Boolean(refusal)}
          onClick={() => changed && send([row.op(value!)])}
        >
          Применить
        </button>
        {row.reset ? (
          <button type="button" className="mw-btn min-h-[44px] max-w-full whitespace-normal px-3" data-module-size-reset={row.key} onClick={() => send([row.reset!])}>
            По ряду
          </button>
        ) : null}
      </div>
      {refusal ? (
        <p className={`text-[13px] leading-snug ${row.why ? 'text-graphiteMw' : 'text-alert'}`} data-module-size-refusal={row.key}>
          {row.why ? `Не правится: ${row.why}.` : refusal}
        </p>
      ) : null}
    </div>
  );
}
