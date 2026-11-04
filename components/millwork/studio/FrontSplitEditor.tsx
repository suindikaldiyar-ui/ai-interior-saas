'use client';

import { useState } from 'react';
import { moduleCarcassHeightMm, moduleDepthMm } from '@/lib/millwork/fill';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import type { MillworkOp, Module, Run } from '@/types/millwork';

/**
 * ФАСАД ПО ВЫСОТЕ И СЕКЦИИ (COMPLETE UNFINISHED, P1/P2) — блок инспектора у выбранного модуля.
 *
 * Деление фасада по высоте — `set_front_split` (швы от дна корпуса): каждая часть — своя створка, своя деталь
 * раскроя и свои петли. «Выровнять» ставит шов на линию соседей ряда — верх и низ их корпусов и их швы, те же
 * отметки, что `runPlaces` рисует в сцене. Шкаф и антресоль над ним — один корпус: `merge_overhead`. Встанет ли —
 * движок вхолостую (`preview`), отказ виден до нажатия. Своих чисел здесь нет.
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

export default function FrontSplitEditor({ unit, run, onOps, preview }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [keepSeam, setKeepSeam] = useState(true);
  const send = (ops: MillworkOp[]) => onOps(ops, (text) => setNotice(text));
  const places = runPlaces(run);
  const me = places.find((p) => p.unit.id === unit.id);
  const heightMm = moduleCarcassHeightMm(unit, run);
  const bottomMm = me ? Math.round(me.y * 1000) : 0;
  const seams = unit.frontSplitMm ?? [];
  const op = (list: number[]): MillworkOp => ({ op: 'set_front_split', moduleId: unit.id, seamsMm: list });
  const verdict = (list: number[]) => preview([op(list)]).warnings[0] ?? null;
  const equal = (parts: number) => Array.from({ length: parts - 1 }, (_, i) => Math.round((heightMm * (i + 1)) / parts));

  /* Линии соседей ряда внутри корпуса: верх и низ их корпусов и их швы — от пола, как в сцене. */
  const lines = new Map<number, string>();
  for (const p of places) {
    if (p.unit.id === unit.id) continue;
    const from = Math.round(p.y * 1000);
    const to = Math.round((p.y + p.heightM) * 1000);
    const name = `«${p.unit.label}» ${p.unit.offsetMm}…${p.unit.offsetMm + p.unit.widthMm}`;
    const add = (mm: number, what: string) => {
      const local = mm - bottomMm;
      if (local > 0 && local < heightMm && !lines.has(mm)) lines.set(mm, `${what} ${name}`);
    };
    add(to, 'верх');
    add(from, 'низ');
    for (const s of p.unit.frontSplitMm ?? []) add(from + s, 'шов');
  }
  const aligned = (lineMm: number): number[] => {
    const local = lineMm - bottomMm;
    if (seams.length === 0) return [local];
    const nearest = seams.reduce((best, s) => (Math.abs(s - local) < Math.abs(best - local) ? s : best), seams[0]);
    return seams.map((s) => (s === nearest ? local : s)).sort((a, b) => a - b);
  };

  /* Антресоль над этим шкафом (или этот модуль — антресоль): объединить в один корпус. */
  const over = unit.overhead
    ? unit
    : run.upperSegments
        .flatMap((s) => s.modules)
        .find((m) => m.overhead && unit.kind === 'tall' && unit.offsetMm <= m.offsetMm && m.offsetMm + m.widthMm <= unit.offsetMm + unit.widthMm);
  const base = unit.overhead ? run.modules.find((m) => m.kind === 'tall' && m.offsetMm <= unit.offsetMm && unit.offsetMm + unit.widthMm <= m.offsetMm + m.widthMm) : unit;
  const mergeOp: MillworkOp | null = over ? { op: 'merge_overhead', moduleId: over.id, keepSeam } : null;
  const mergeNo = mergeOp ? (preview([mergeOp]).warnings[0] ?? null) : null;
  const mergeWords =
    over && base
      ? `Шкаф ${moduleCarcassHeightMm(base, run)} мм и антресоль ${moduleCarcassHeightMm(over, run)} мм станут одним корпусом ` +
        `${moduleCarcassHeightMm(base, run) + moduleCarcassHeightMm(over, run)} мм: ширина ${base.widthMm} мм и глубина ${moduleDepthMm(base, run.zone, run.production)} мм — шкафа` +
        (over.widthMm !== base.widthMm ? ` (антресоль была ${over.widthMm} мм)` : '') +
        (over.overhead && over.overhead.depthMm !== moduleDepthMm(base, run.zone, run.production) ? `, антресоль была глубиной ${over.overhead.depthMm} мм — выступа не будет` : '') +
        '. Полки антресоли переедут в шкаф на отверстия 32, на месте прежней крыши — полка' +
        (keepSeam ? `; шов фасада — на прежней границе, ${plinthTop(base, run)} мм от пола.` : '; фасад — одна створка во всю высоту.')
      : null;

  return (
    <section className="mw-panel grid gap-3" data-front-split={unit.id} data-front-split-now={seams.join(',')} data-front-split-height={heightMm} data-front-split-bottom={bottomMm}>
      <p className="text-[15px] font-medium">Фасад по высоте и секции</p>
      <p className="text-[13px] leading-snug text-text-dim">
        Корпус {heightMm} мм, низ на {bottomMm} мм от пола. Каждая часть фасада — своя створка на своих петлях и своя деталь раскроя;
        полки внутри — в блоке наполнения.
      </p>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4].map((parts) => {
          const list = parts === 1 ? [] : equal(parts);
          const no = parts === 1 ? null : verdict(list);
          const active = (parts === 1 && seams.length === 0) || (parts > 1 && seams.join() === list.join());
          return (
            <button
              key={parts}
              type="button"
              className="mw-btn max-w-full whitespace-normal"
              data-front-split-parts={parts}
              aria-pressed={active}
              disabled={Boolean(no)}
              title={no ?? undefined}
              onClick={() => send([op(list)])}
            >
              {parts === 1 ? 'Одна створка' : `${parts} части поровну`}
            </button>
          );
        })}
      </div>
      {seams.map((seam, i) => (
        <SeamRow key={`${i}:${seam}`} index={i} seam={seam} bottomMm={bottomMm} seams={seams} verdict={verdict} send={(list) => send([op(list)])} />
      ))}
      {lines.size > 0 && (
        <div className="grid gap-2">
          <p className="text-[13px] text-text-dim">Выровнять шов по линии соседей:</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(lines.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([mm, what]) => {
                const list = aligned(mm);
                const no = verdict(list);
                return (
                  <button
                    key={mm}
                    type="button"
                    className="mw-btn max-w-full whitespace-normal text-left"
                    data-front-split-align={mm}
                    disabled={Boolean(no)}
                    title={no ?? undefined}
                    onClick={() => send([op(list)])}
                  >
                    {mm} мм — {what}
                  </button>
                );
              })}
          </div>
        </div>
      )}
      {mergeOp && (
        <div className="grid gap-2" data-merge-overhead={over!.id}>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={keepSeam} onChange={(e) => setKeepSeam(e.target.checked)} data-merge-keep-seam />
            Шов фасада на прежней границе корпусов
          </label>
          <p className="text-[13px] leading-snug" data-merge-words>
            {mergeNo ?? mergeWords}
          </p>
          <button
            type="button"
            className="mw-btn max-w-full whitespace-normal"
            data-merge-apply
            disabled={Boolean(mergeNo)}
            onClick={() => send([mergeOp])}
          >
            Объединить шкаф и антресоль в один корпус
          </button>
        </div>
      )}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-front-split-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}

/** Верх корпуса шкафа от пола — граница с антресолью над ним (та же отметка, что низ антресоли в сцене). */
function plinthTop(base: Module, run: Run): number {
  const place = runPlaces(run).find((p) => p.unit.id === base.id);
  return place ? Math.round((place.y + place.heightM) * 1000) : 0;
}

function SeamRow({
  index,
  seam,
  bottomMm,
  seams,
  verdict,
  send,
}: {
  index: number;
  seam: number;
  bottomMm: number;
  seams: number[];
  verdict: (list: number[]) => string | null;
  send: (list: number[]) => void;
}) {
  const [text, setText] = useState(String(bottomMm + seam));
  const wanted = num(text);
  const list = wanted === undefined ? null : seams.map((s, i) => (i === index ? wanted - bottomMm : s)).sort((a, b) => a - b);
  const no = list ? verdict(list) : 'Введите отметку числом, мм от пола.';
  const changed = wanted !== undefined && wanted !== bottomMm + seam;
  return (
    <div className="grid gap-1" data-front-seam={index}>
      <label className="flex flex-wrap items-center gap-2 text-[13px]">
        <span>Шов {index + 1}, мм от пола</span>
        <input className="mw-field w-28" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} data-front-seam-input={index} />
        <button type="button" className="mw-btn" data-front-seam-apply={index} disabled={!changed || Boolean(no)} onClick={() => list && send(list)}>
          Применить
        </button>
      </label>
      {changed && no ? (
        <p className="text-[13px] leading-snug text-alert" data-front-seam-refusal={index}>
          {no}
        </p>
      ) : null}
    </div>
  );
}
